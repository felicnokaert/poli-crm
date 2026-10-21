import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, GraduationCap, Search, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { AssistantLogo } from "./AssistantLogo.jsx";
import { KNOWLEDGE_TYPES } from "./knowledge-search.mjs";
import { buildAiContext, detectIntent, guideFacts, matchTaught, mlQuery, productWords, teamAnswer } from "./assistant-answer.mjs";
import { useKnowledge } from "./useKnowledge.js";

// Ventana del asistente (21/10): flotante, abajo a la derecha (en el celular ocupa la pantalla). Por ahora
// busca por palabras en todo lo que sabe el CRM, sin IA ni costo. Cuando se apruebe el presupuesto, esta
// misma ventana pasa a conversar; lo que ve el equipo no cambia.
// 21/10: arriba va la respuesta concreta (src/assistant-answer.mjs); el resto queda en "Ver todo".
// "Enseñarle" (solo Felipe): la respuesta correcta queda en assistant_knowledge y va primero para todos.
// 👍/👎 de cualquiera quedan en assistant_feedback para que Felipe corrija.
const SUGGESTIONS = ["rendimiento epoxi", "secado poxiplast", "mezcla epoxi", "epoxi alimentos", "poliurea", "espuma aislante"];
const PER_GROUP = 3;

// Las respuestas de Mercado Libre del tema y producto, con una pausa mientras se escribe.
function useTeamAnswer(supabase, query, intent) {
  const [rows, setRows] = useState([]);
  const q = intent ? mlQuery(query, intent) : "";
  useEffect(() => {
    if (!supabase?.rpc || !q) { setRows([]); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      supabase.rpc("search_ml_knowledge", { q, max_rows: 40 })
        .then(({ data, error }) => { if (active) setRows(error ? [] : data || []); }, () => {});
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, q]);
  return rows;
}

// Pregunta a la IA (lib/assistant-ai.mjs vía /api/admin-users). Sin clave o sin crédito devuelve
// { ok: false, reason } y la ventana sigue como buscador.
async function askAi(supabase, payload) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/admin-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: JSON.stringify({ action: "assistant", ...payload }),
  });
  return response.json().catch(() => ({ ok: false, reason: "red" }));
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* sin portapapeles */ }
  }
  return <button type="button" className="assistant-copy" onClick={copy}><Copy size={14} /> {copied ? "Copiado" : "Copiar"}</button>;
}

// 👍 / 👎: queda guardado para que Felipe revise lo que salió mal.
function Votes({ supabase, question, answer, source, onBad }) {
  const [voted, setVoted] = useState(0);
  async function vote(value) {
    setVoted(value);
    if (supabase?.from) await Promise.resolve(supabase.from("assistant_feedback").insert({ question, answer: String(answer || "").slice(0, 4000), source, vote: value })).catch(() => {});
    if (value < 0 && onBad) onBad();
  }
  if (voted) return <span className="muted small">{voted > 0 ? "¡Gracias!" : "Gracias, queda anotado para corregirlo."}</span>;
  return (
    <span className="assistant-votes">
      <button type="button" aria-label="Me sirvió" onClick={() => vote(1)}><ThumbsUp size={14} /></button>
      <button type="button" aria-label="No me sirvió" onClick={() => vote(-1)}><ThumbsDown size={14} /></button>
    </span>
  );
}

// Formulario para enseñarle (solo Felipe). Si viene con id, corrige lo ya enseñado.
function TeachForm({ supabase, initial, onSaved, onCancel }) {
  const [form, setForm] = useState({ question: initial.question || "", product: initial.product || "", answer: initial.answer || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  async function save(event) {
    event.preventDefault();
    if (!form.question.trim() || !form.answer.trim()) { setError("Completá la pregunta y la respuesta."); return; }
    setBusy(true); setError("");
    const row = { question: form.question.trim(), product: form.product.trim(), answer: form.answer.trim(), updated_at: new Date().toISOString() };
    const request = initial.id
      ? supabase.from("assistant_knowledge").update(row).eq("id", initial.id).select("*")
      : supabase.from("assistant_knowledge").insert(row).select("*");
    const { data, error: saveError } = await request;
    setBusy(false);
    if (saveError || !data?.length) { setError("No se pudo guardar. Probá de nuevo."); return; }
    onSaved(data[0]);
  }
  async function remove() {
    setBusy(true);
    const { error: deleteError } = await supabase.from("assistant_knowledge").delete().eq("id", initial.id);
    setBusy(false);
    if (deleteError) { setError("No se pudo borrar."); return; }
    onSaved(null, initial.id);
  }
  return (
    <form className="assistant-teach" onSubmit={save} aria-label="Enseñarle al asistente">
      <strong><GraduationCap size={15} /> {initial.id ? "Corregir lo que le enseñaste" : "Enseñarle la respuesta correcta"}</strong>
      <label>Pregunta<input value={form.question} onChange={set("question")} placeholder="¿Cuánto rinde?" /></label>
      <label>Producto (opcional)<input value={form.product} onChange={set("product")} placeholder="Easy Spray" /></label>
      <label>Respuesta correcta<textarea rows={4} value={form.answer} onChange={set("answer")} placeholder="Cada envase rinde 2 m² en 2 cm de espesor." /></label>
      {error && <span className="muted small">{error}</span>}
      <div className="assistant-teach-actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        {initial.id && <button type="button" className="link-button" disabled={busy} onClick={remove}>Borrar</button>}
      </div>
      <span className="muted small">Desde ahora va primero para todo el equipo, antes que Mercado Libre y las fichas.</span>
    </form>
  );
}

function Answer({ intent, facts, team, product, taught = [], isAdmin, onEdit }) {
  return (
    <section className="assistant-answer" aria-label="Respuesta">
      <span className="assistant-group-label">{intent?.label || "Respuesta"}{product ? ` · ${product}` : ""}</span>
      {taught.map((entry) => (
        <div key={entry.id} className="assistant-answer-team">
          <p>{entry.answer}</p>
          <div className="assistant-answer-meta">
            <span className="muted small">✓ Validada por Felipe{entry.product ? ` · ${entry.product}` : ""}</span>
            <span className="assistant-answer-tools">
              {isAdmin && <button type="button" className="link-button" onClick={() => onEdit(entry)}>Editar</button>}
              <CopyButton text={entry.answer} />
            </span>
          </div>
        </div>
      ))}
      {team?.varied && (
        <div className="assistant-answer-facts">
          <span className="muted small">En Mercado Libre respondimos distinto según el producto ({team.total} respuestas):</span>
          <ul>{team.examples.map((text) => <li key={text}>{text}</li>)}</ul>
        </div>
      )}
      {team && !team.varied && (
        <div className="assistant-answer-team">
          <p>{team.text}</p>
          <div className="assistant-answer-meta">
            <span className="muted small">Así lo respondemos en Mercado Libre · {team.uses} de {team.total} respuestas</span>
            <CopyButton text={team.text} />
          </div>
        </div>
      )}
      {facts.length > 0 && (
        <div className="assistant-answer-facts">
          <span className="muted small">Según la guía:</span>
          <ul>{facts.map((fact) => <li key={`${fact.guide}-${fact.text}`}>{fact.text} <span className="muted small">({fact.guide}{fact.validated ? "" : ", borrador"})</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function AssistantWindow({ supabase, clients = [], firstName = "", isAdmin = false, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const [showAll, setShowAll] = useState(false);
  const { result, guides } = useKnowledge(supabase, query, { clients });
  const groups = KNOWLEDGE_TYPES.filter(([key]) => result.groups[key]?.length);
  const typed = query.trim();
  const intent = typed ? detectIntent(typed) : null;
  const teamRows = useTeamAnswer(supabase, typed, intent);
  const facts = intent ? guideFacts(guides, typed, intent) : [];
  const team = intent ? teamAnswer(teamRows, intent) : null;
  const [taughtAll, setTaughtAll] = useState([]);
  const [teach, setTeach] = useState(null); // datos del formulario "Enseñarle" abierto
  useEffect(() => {
    if (!supabase?.from) return;
    Promise.resolve(supabase.from("assistant_knowledge").select("id,question,product,answer,updated_at")).then(({ data }) => setTaughtAll(data || []), () => {});
  }, [supabase]);
  const taught = typed ? matchTaught(taughtAll, typed) : [];
  const hasAnswer = Boolean(taught.length || (intent && (facts.length || team)));
  useEffect(() => { setShowAll(false); }, [typed]);
  const [chat, setChat] = useState([]);
  const [ai, setAi] = useState("unknown"); // unknown | on | off
  const [thinking, setThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  const bodyRef = useRef(null);
  useEffect(() => { const body = bodyRef.current; if (body && typeof body.scrollTo === "function") body.scrollTo({ top: body.scrollHeight, behavior: "smooth" }); }, [chat, thinking]);

  const lastQuestion = [...chat].reverse().find((turn) => turn.role === "user")?.text || "";
  const teachFrom = (answer = "") => setTeach({ question: typed || lastQuestion, product: productWords(typed, intent).join(" "), answer });
  function taughtSaved(entry, removedId) {
    setTaughtAll((current) => (removedId ? current.filter((item) => item.id !== removedId) : [entry, ...current.filter((item) => item.id !== entry.id)]));
    setTeach(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (!typed || thinking || ai === "off" || !supabase?.auth) return;
    setThinking(true); setAiError("");
    const context = buildAiContext({ intent, facts, team, result, mlRows: teamRows, taught });
    const reply = await askAi(supabase, { question: typed, context, history: chat }).catch(() => ({ ok: false, reason: "red" }));
    setThinking(false);
    if (reply.ok) {
      setAi("on");
      setChat((current) => [...current, { role: "user", text: typed }, { role: "assistant", text: reply.text }]);
      setQuery("");
      return;
    }
    if (reply.reason === "sin-clave" || reply.reason === "sin-credito") { setAi("off"); return; }
    setAiError(reply.error || "La IA no pudo responder ahora. Probá de nuevo.");
  }

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(timer); };
  }, [onClose]);

  return (
    <aside className="assistant-window" role="dialog" aria-label="Asistente">
      <header className="assistant-window-head">
        <span className="assistant-window-logo"><AssistantLogo size={34} /></span>
        <div>
          <strong>Asistente Poliplast</strong>
          <span>Fichas, guías, clientes, competencia y Mercado Libre</span>
        </div>
        <button type="button" className="assistant-close" aria-label="Cerrar el asistente" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="assistant-window-body" ref={bodyRef}>
        <div className="assistant-bubble">
          <strong>¡Hola{firstName ? `, ${firstName}` : ""}!</strong> ¿Qué necesitás saber? Escribí un producto, un uso, un cliente o un competidor y te muestro lo que hay cargado.
        </div>
        {chat.map((turn, index) => (
          <div key={index} className={turn.role === "user" ? "assistant-msg-user" : "assistant-bubble assistant-msg-ai"}>
            <p>{turn.text}</p>
            {turn.role === "assistant" && (
              <div className="assistant-answer-meta">
                <Votes supabase={supabase} question={chat[index - 1]?.text || ""} answer={turn.text} source="ia" onBad={isAdmin ? () => setTeach({ question: chat[index - 1]?.text || "", product: "", answer: turn.text }) : null} />
                <CopyButton text={turn.text} />
              </div>
            )}
          </div>
        ))}
        {thinking && <div className="assistant-bubble muted" role="status">Pensando…</div>}
        {aiError && <div className="assistant-bubble muted">{aiError}</div>}
        {!typed && !chat.length && (
          <div className="assistant-chips" aria-label="Sugerencias">
            {SUGGESTIONS.map((text) => <button key={text} type="button" onClick={() => setQuery(text)}>{text}</button>)}
          </div>
        )}
        {typed && result.total === 0 && !hasAnswer && (
          <div className="assistant-bubble muted">
            No encontré nada con “{typed}”. Probá con otra palabra o más corta.
            {isAdmin && !teach && <> <button type="button" className="link-button" onClick={() => teachFrom("")}>Enseñarle esta respuesta</button></>}
          </div>
        )}
        {hasAnswer && (
          <>
            <Answer intent={intent} facts={facts} team={team} taught={taught} isAdmin={isAdmin} onEdit={(entry) => setTeach(entry)} product={productWords(typed, intent).join(" ")} />
            <div className="assistant-answer-meta">
              <Votes key={typed} supabase={supabase} question={typed} answer={taught[0]?.answer || team?.text || facts.map((fact) => fact.text).join(" · ")} source={taught.length ? "validada" : "buscador"} onBad={isAdmin ? () => teachFrom(team && !team.varied ? team.text : "") : null} />
              {isAdmin && !teach && <button type="button" className="link-button" onClick={() => teachFrom(taught[0]?.answer || (team && !team.varied ? team.text : ""))}><GraduationCap size={14} /> Enseñarle</button>}
            </div>
          </>
        )}
        {teach && <TeachForm key={teach.id || teach.question} supabase={supabase} initial={teach} onSaved={taughtSaved} onCancel={() => setTeach(null)} />}
        {hasAnswer && result.total > 0 && (
          <button type="button" className="assistant-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            <ChevronDown size={15} /> {showAll ? "Ocultar lo demás" : `Ver todo lo que encontré (${result.total})`}
          </button>
        )}
        {(!hasAnswer || showAll) && groups.map(([key, label]) => (
          <section key={key} className="assistant-group">
            <span className="assistant-group-label">{label}</span>
            {result.groups[key].slice(0, PER_GROUP).map((item) => (
              <article key={`${key}-${item.id}`} className="assistant-card">
                <strong>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</strong>
                {item.subtitle && <span className="muted small">{item.subtitle}</span>}
                {item.snippet && <q>{item.snippet}</q>}
              </article>
            ))}
          </section>
        ))}
      </div>

      <footer className="assistant-window-foot">
        <form className="assistant-input" onSubmit={submit}>
          <Search size={17} />
          <input ref={inputRef} aria-label="Preguntale al asistente" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={chat.length ? "Seguí preguntando…" : "Ej.: cuánto rinde la epoxi"} />
          {ai !== "off" && <button type="submit" className="assistant-send" aria-label="Preguntar" disabled={!typed || thinking}><Send size={16} /></button>}
        </form>
        <small className="muted">{ai === "off" ? "La IA se activa cuando se carguen los créditos; mientras, te muestro lo que hay cargado." : ai === "on" ? "Responde con lo cargado y con lo que más respondimos en Mercado Libre. Revisá antes de pasarle un dato a un cliente." : "Escribí y apretá Enter para preguntar. Responde con lo cargado y con lo que ya respondimos en Mercado Libre."}</small>
      </footer>
    </aside>
  );
}
