import { useEffect, useRef, useState } from "react";
import { GraduationCap, Play } from "lucide-react";
import { askAi, TeachForm } from "./AssistantWindow.jsx";
import { matchTaught } from "./assistant-answer.mjs";
import { pickQuestions, realAnswer, suggestTeachings, trainingContext, trainingQuestion } from "./assistant-training.mjs";

// Más → Datos → Asistente (solo Felipe, 21/10). Toma preguntas reales ya respondidas en Mercado Libre, se
// las hace a la IA sin mostrarle la respuesta real y pone las dos lado a lado. Si la IA le erra, "Enseñarle"
// guarda la respuesta correcta (assistant_knowledge) y desde ahí va primero para todo el equipo.
// Cada pregunta cuesta centavos de dólar del crédito prepago.
const BATCH = 10;

// La base entrega hasta 1000 filas por pedido: se piden de a páginas hasta traer todo (21/10: sin esto
// faltaban títulos y preguntas, y las sugeridas daban 0).
async function fetchAll(page, size = 1000, maxPages = 20) {
  const rows = [];
  for (let index = 0; index < maxPages; index += 1) {
    const { data, error } = await page(index * size, index * size + size - 1);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < size) break;
  }
  return { data: rows };
}

// 👎 para revisar (22/10): lo que el equipo marcó como "no me sirvió". Felipe le enseña la respuesta correcta
// (queda resuelto como "enseñada") o lo descarta. Los 👍 solo se cuentan.
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");
const who = (email) => String(email || "").split("@")[0];

function FeedbackReview({ supabase }) {
  const [rows, setRows] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [teach, setTeach] = useState(null);
  const [error, setError] = useState("");
  async function load() {
    const { data, error: loadError } = await supabase.from("assistant_feedback").select("id,question,answer,source,vote,email,created_at,resolved_at,resolution").order("created_at", { ascending: false }).limit(500);
    if (loadError) { setError("No se pudieron leer los votos."); setRows([]); return; }
    setRows(data || []);
  }
  useEffect(() => { if (supabase?.from) load(); }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps
  async function resolve(row, resolution) {
    const resolvedAt = new Date().toISOString();
    const { error: saveError } = await supabase.from("assistant_feedback").update({ resolved_at: resolvedAt, resolution }).eq("id", row.id);
    if (saveError) { setError("No se pudo marcar como resuelto."); return; }
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, resolved_at: resolvedAt, resolution } : item)));
  }
  if (!rows) return <p className="muted small">Cargando votos…</p>;
  const bad = rows.filter((row) => row.vote < 0);
  const pending = bad.filter((row) => !row.resolved_at);
  const good = rows.filter((row) => row.vote > 0).length;
  const shown = showDone ? bad : pending;
  return (
    <section className="panel" aria-label="Revisar votos">
      <h3>Lo que no le sirvió al equipo (👎) y preguntas sin buena respuesta</h3>
      <p className="muted small">{pending.length} para revisar · {bad.length - pending.length} ya resueltos · {good} 👍 en total. Enseñale la respuesta correcta o descartalo si no corresponde. Las marcadas “automático” son preguntas en las que la IA no tenía el dato: enseñándolas, la próxima vez responde bien.</p>
      {error && <p className="muted small">{error}</p>}
      <div className="assistant-teach-actions">
        <button type="button" className="secondary" onClick={load}>Actualizar</button>
        <label className="small"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} /> Ver también los resueltos</label>
      </div>
      {teach && <TeachForm key={teach.row.id} supabase={supabase} initial={{ question: teach.row.question, product: "", answer: "" }} onSaved={() => { resolve(teach.row, "enseñada"); setTeach(null); }} onCancel={() => setTeach(null)} />}
      {shown.length === 0 && <p className="muted">{pending.length ? "" : "No hay 👎 pendientes. ¡Bien!"}</p>}
      <div className="training-list">
        {shown.map((row) => (
          <article key={row.id} className="training-row">
            <span className="muted small">{when(row.created_at)} · {who(row.email)} · {row.source === "ia-sin-dato" ? "automático: la IA no tenía el dato" : row.source === "ia" ? "respuesta de la IA" : row.source === "validada" ? "respuesta validada" : "buscador"}{row.resolved_at ? ` · resuelto (${row.resolution || "sí"})` : ""}</span>
            <strong>{row.question}</strong>
            {row.answer && <div className="training-compare"><div><span className="muted small">Lo que respondió</span><p>{row.answer}</p></div></div>}
            {!row.resolved_at && (
              <div className="assistant-teach-actions">
                <button type="button" className="link-button" onClick={() => setTeach({ row })}><GraduationCap size={14} /> Enseñarle la correcta</button>
                <button type="button" className="link-button" onClick={() => resolve(row, "descartada")}>Descartar</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function AssistantTraining({ supabase }) {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [teach, setTeach] = useState(null);
  const [usage, setUsage] = useState({ input: 0, output: 0 });
  const [suggested, setSuggested] = useState(null);
  const [teachingId, setTeachingId] = useState("");
  const stop = useRef(false);
  const pool = useRef(null);

  // Las preguntas y títulos de Mercado Libre, y las guías y lo enseñado, se traen una vez.
  async function load() {
    if (pool.current) return pool.current;
    const [questions, items, guides, taught] = await Promise.all([
      fetchAll((from, to) => supabase.from("ml_questions").select("id,item_id,question,answer").order("id").range(from, to)),
      fetchAll((from, to) => supabase.from("ml_items").select("id,title").order("id").range(from, to)),
      supabase.from("product_guides").select("id,family,product,summary,sections,status"),
      supabase.from("assistant_knowledge").select("id,question,product,answer"),
    ]);
    const titles = Object.fromEntries((items.data || []).map((item) => [item.id, item.title]));
    pool.current = { questions: questions.data || [], titles, guides: guides.data || [], taught: taught.data || [] };
    return pool.current;
  }

  async function run() {
    setRunning(true); setStatus("Buscando preguntas…"); stop.current = false;
    const { questions, titles, guides, taught } = await load();
    const picked = pickQuestions(questions, titles, { count: BATCH });
    if (!picked.length) { setStatus("No encontré preguntas de Mercado Libre para probar."); setRunning(false); return; }
    for (const [index, row] of picked.entries()) {
      if (stop.current) break;
      setStatus(`Preguntando ${index + 1} de ${picked.length}…`);
      const question = trainingQuestion(row);
      const siblings = questions.filter((other) => other.item_id === row.item_id).slice(0, 40);
      const { team, context } = trainingContext(row, siblings, { guides, taught: matchTaught(taught, question) });
      const reply = await askAi(supabase, { question, context }).catch(() => ({ ok: false, reason: "red" }));
      if (!reply.ok && ["sin-clave", "sin-credito", "clave"].includes(reply.reason)) {
        setStatus(`${reply.error || "La IA no está disponible."}${reply.detail ? ` (${reply.detail})` : ""}`);
        setRunning(false);
        return;
      }
      if (reply.usage) setUsage((current) => ({ input: current.input + (reply.usage.input || 0), output: current.output + (reply.usage.output || 0) }));
      setRows((current) => [{ ...row, asked: question, ai: reply.ok ? reply.text : `(No respondió: ${reply.error || reply.reason})`, team }, ...current]);
    }
    setStatus(stop.current ? "Pausado." : "Listo. Revisá cada una: si la IA le erró, enseñale la correcta.");
    setRunning(false);
  }

  // "¿Anda la IA?" (22/10): una pregunta mínima (menos de un centavo) que dice si responde o el error exacto.
  async function check() {
    setStatus("Probando la IA…");
    const reply = await askAi(supabase, { question: "Respondé solo: La IA del CRM está funcionando.", context: "" }).catch(() => ({ ok: false, reason: "red" }));
    setStatus(reply.ok ? `✓ La IA responde: “${reply.text.split(/\n/)[0].slice(0, 120)}”` : `✗ No responde: ${reply.error || reply.reason}${reply.detail ? ` (${reply.detail})` : ""}`);
  }

  // Sugeridas: lo que el equipo repitió 3+ veces por producto y tema. No usa IA: no gasta nada.
  async function suggest() {
    setStatus("Buscando lo que más repetimos…");
    const { questions, titles, taught } = await load();
    setSuggested(suggestTeachings(questions, titles, { taught }));
    setStatus("");
  }
  function saved() {
    setTeach(null); pool.current = null;
    if (teachingId) setSuggested((current) => (current || []).filter((entry) => entry.id !== teachingId));
    setTeachingId("");
    setStatus("Guardado: desde ahora va primero para todo el equipo.");
  }

  useEffect(() => () => { stop.current = true; }, []);

  return (
    <>
    <FeedbackReview supabase={supabase} />
    <section className="panel" aria-label="Probar el asistente">
      <h3>Probar el asistente con Mercado Libre</h3>
      <p className="muted small">
        Toma {BATCH} preguntas reales ya respondidas, se las hace a la IA <strong>sin mostrarle la respuesta real</strong> (solo lo que respondimos en otras preguntas de esa publicación, las guías y lo que le enseñaste) y las compara. Cada tanda cuesta centavos del crédito.
      </p>
      <p className="muted small">Al enseñarle, completá el <strong>producto corto</strong> (ej. “Easy Spray”): así la respuesta se usa solo para ese producto.</p>
      <div className="assistant-teach-actions">
        <button type="button" className="primary" disabled={running} onClick={run}><Play size={15} /> {rows.length ? "Probar otras 10" : "Probar 10 preguntas"}</button>
        {running && <button type="button" className="secondary" onClick={() => { stop.current = true; }}>Pausar</button>}
        <button type="button" className="secondary" disabled={running} onClick={check}>¿Anda la IA?</button>
        <button type="button" className="secondary" disabled={running} onClick={suggest}><GraduationCap size={15} /> Ver respuestas sugeridas</button>
        {status && <span className="muted small" role="status">{status}</span>}
      </div>
      {usage.input > 0 && <p className="muted small">Usado en esta prueba: {usage.input.toLocaleString("es-AR")} tokens de entrada y {usage.output.toLocaleString("es-AR")} de salida (el gasto exacto se ve en la consola de Anthropic → Usage).</p>}
      {teach && <TeachForm key={teach.question} supabase={supabase} initial={teach} onSaved={saved} onCancel={() => setTeach(null)} />}
      {suggested && (
        <div className="training-list">
          <strong>Respuestas sugeridas ({suggested.length}) · lo que más repetimos en Mercado Libre, sin costo</strong>
          {suggested.length === 0 && <p className="muted small">No hay más sugeridas por ahora.</p>}
          {suggested.map((entry) => (
            <article key={entry.id} className="training-row">
              <span className="muted small">{entry.title}</span>
              <strong>{entry.product} · {entry.question}</strong>
              <p>{entry.answer}</p>
              <span className="muted small">Lo respondimos así en {entry.uses} de {entry.total} preguntas{entry.titles?.length > 1 ? ` (en ${entry.titles.length} variantes del producto)` : ""}</span>
              <button type="button" className="link-button" onClick={() => { setTeachingId(entry.id); setTeach({ question: entry.question, product: entry.product, answer: entry.answer }); }}><GraduationCap size={14} /> Revisar y aprobar</button>
            </article>
          ))}
        </div>
      )}
      <div className="training-list">
        {rows.map((row) => (
          <article key={row.id} className="training-row">
            <span className="muted small">{row.intent?.label} · {row.title || "Publicación sin título"}</span>
            <strong>{row.question}</strong>
            <div className="training-compare">
              <div><span className="muted small">Lo que respondimos</span><p>{realAnswer(row)}</p></div>
              <div><span className="muted small">Lo que dijo la IA</span><p>{row.ai}</p></div>
            </div>
            <button type="button" className="link-button" onClick={() => setTeach({ question: row.question, product: "", answer: realAnswer(row) })}><GraduationCap size={14} /> Enseñarle la nuestra</button>
          </article>
        ))}
      </div>
    </section>
    </>
  );
}
