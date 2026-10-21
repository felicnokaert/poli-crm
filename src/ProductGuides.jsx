import { useEffect, useState } from "react";
import { CircleAlert, Search } from "lucide-react";
import { filterGuides, guideFamilies, guideMlQuery, guideToText } from "./product-guides.mjs";
import { Empty } from "./ui-primitives";

// Lo que ya se respondió en Mercado Libre sobre este producto (21/10). Son respuestas reales del equipo:
// sirven de base, pero no siempre coinciden entre sí ni con la ficha, por eso se avisa.
function MercadoLibreAnswers({ supabase, guide }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const q = guideMlQuery(guide);
    if (!supabase?.rpc || !q) { setRows([]); return; }
    supabase.rpc("search_ml_knowledge", { q, max_rows: 6 })
      .then(({ data, error }) => setRows(error ? [] : (data || []).filter((row) => row.kind === "pregunta").slice(0, 5)), () => setRows([]));
  }, [supabase, guide]);
  if (!rows?.length) return null;
  return (
    <div className="guide-ml">
      <h3>Lo que ya respondimos en Mercado Libre</h3>
      <ul>
        {rows.map((row) => {
          const [question, answer] = String(row.body).replace(/^Pregunta: /, "").split("\nRespuesta: ");
          return <li key={row.id}><strong>{question}</strong><br /><span>{answer}</span>{row.permalink && <> · <a href={row.permalink} target="_blank" rel="noreferrer">publicación</a></>}</li>;
        })}
      </ul>
      <p className="muted small">Respuestas reales del equipo. No siempre coinciden con la ficha: revisá antes de copiar.</p>
    </div>
  );
}

// Academia → Productos: una guía por producto armada con las fichas técnicas (19/10). Todos la leen;
// solo Felipe valida o la vuelve a borrador.
export function ProductGuides({ supabase, isAdmin = false, userEmail = "" }) {
  const [guides, setGuides] = useState(null);
  const [error, setError] = useState("");
  const [family, setFamily] = useState("Todas");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!supabase) { setGuides([]); return; }
    supabase.from("product_guides").select("id,family,product,summary,sections,sources,status,validated_by_email,validated_at,updated_at").then(({ data, error: loadError }) => {
      if (loadError) { setError("No se pudieron cargar las guías."); setGuides([]); return; }
      setGuides(data || []);
    });
  }, [supabase]);

  const list = filterGuides(guides || [], { family, query });
  const families = guideFamilies(guides || []);
  const drafts = (guides || []).filter((guide) => guide.status !== "validada").length;

  async function copy(guide) {
    try { await navigator.clipboard.writeText(guideToText(guide)); setCopied(guide.id); setTimeout(() => setCopied(""), 1800); } catch { setCopied("error"); }
  }

  async function setStatus(guide, status) {
    setBusy(guide.id);
    setError("");
    const patch = status === "validada"
      ? { status, validated_by_email: userEmail || null, validated_at: new Date().toISOString() }
      : { status, validated_by_email: null, validated_at: null };
    const { data, error: saveError } = await supabase.from("product_guides").update(patch).eq("id", guide.id).select("id");
    setBusy("");
    if (saveError || !data?.length) { setError("No se pudo cambiar el estado de la guía."); return; }
    setGuides((current) => current.map((item) => (item.id === guide.id ? { ...item, ...patch } : item)));
  }

  return (
    <section className="panel commercial-knowledge product-guides">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Armadas con las fichas técnicas</span>
          <h2>Guías por producto</h2>
          <p>Para qué sirve cada producto, sus datos clave, cómo se aplica y qué preguntarle al cliente. Cada guía dice de qué ficha sale.</p>
        </div>
        <label className="search"><Search size={17} /><input aria-label="Buscar guía" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: techo, 770, poliurea, molde…" /></label>
      </div>
      {families.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Familia">
          {["Todas", ...families].map((key) => (
            <button key={key} type="button" role="tab" aria-selected={family === key} className={family === key ? "selected" : ""} onClick={() => setFamily(key)}>{key}</button>
          ))}
        </div>
      )}
      {error && <div className="system-message error">{error}</div>}
      {guides === null && <p className="muted">Cargando…</p>}
      {guides && guides.length === 0 && !error && <Empty text={supabase ? "Todavía no hay guías cargadas." : "Las guías están en la versión en línea."} />}
      {guides && guides.length > 0 && list.length === 0 && <Empty text="No hay guías con eso. Probá con otra palabra o familia." />}
      <div className="guide-list">
        {list.map((guide) => {
          const expanded = open === guide.id;
          return (
            <article key={guide.id} className="guide-card">
              <button type="button" className="guide-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : guide.id)}>
                <span>
                  <strong>{guide.product}</strong>
                  <span className="muted small"> · {guide.family}</span>
                  {guide.status === "validada" ? <span className="badge ok">Validada</span> : <span className="badge warn">Borrador</span>}
                </span>
                <span className="muted small">{guide.summary}</span>
              </button>
              {expanded && (
                <div className="guide-body">
                  {(guide.sections || []).map((section) => (
                    <div key={section.title}>
                      <h3>{section.title}</h3>
                      <ul>{(section.items || []).map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ))}
                  <MercadoLibreAnswers supabase={supabase} guide={guide} />
                  <p className="muted small">Fuente: {(guide.sources || []).map((source) => source.title).join(" · ") || "sin fuente"}</p>
                  {guide.status !== "validada" && <p className="muted small">Borrador armado leyendo las fichas: falta que Felipe lo valide. Confirmá antes de pasar un dato a un cliente.</p>}
                  <div className="panel-head-actions">
                    <button type="button" className="secondary" onClick={() => copy(guide)}>{copied === guide.id ? "Copiado ✓" : "Copiar guía"}</button>
                    {isAdmin && guide.status !== "validada" && <button type="button" className="primary" disabled={busy === guide.id} onClick={() => setStatus(guide, "validada")}>Validar</button>}
                    {isAdmin && guide.status === "validada" && <button type="button" className="secondary" disabled={busy === guide.id} onClick={() => setStatus(guide, "borrador")}>Volver a borrador</button>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {copied === "error" && <div className="system-message">No se pudo copiar automáticamente. Seleccioná el texto a mano.</div>}
      <div className="quality-note"><CircleAlert size={19} /><p>Solo dicen lo que figura en las fichas técnicas cargadas; no hay precios.{drafts > 0 ? ` ${drafts} todavía son borrador.` : ""} Si una ficha cambia, la guía hay que revisarla.</p></div>
    </section>
  );
}
