import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Search, X } from "lucide-react";
import { AssistantLogo } from "./AssistantLogo.jsx";
import { KNOWLEDGE_TYPES } from "./knowledge-search.mjs";
import { detectIntent, guideFacts, mlQuery, productWords, teamAnswer } from "./assistant-answer.mjs";
import { useKnowledge } from "./useKnowledge.js";

// Ventana del asistente (21/10): flotante, abajo a la derecha (en el celular ocupa la pantalla). Por ahora
// busca por palabras en todo lo que sabe el CRM, sin IA ni costo. Cuando se apruebe el presupuesto, esta
// misma ventana pasa a conversar; lo que ve el equipo no cambia.
// 21/10: arriba va la respuesta concreta (src/assistant-answer.mjs); el resto queda en "Ver todo".
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

function Answer({ intent, facts, team, product }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(team.text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* sin portapapeles */ }
  }
  return (
    <section className="assistant-answer" aria-label="Respuesta">
      <span className="assistant-group-label">{intent.label}{product ? ` · ${product}` : ""}</span>
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
            <button type="button" className="assistant-copy" onClick={copy}><Copy size={14} /> {copied ? "Copiado" : "Copiar"}</button>
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

export function AssistantWindow({ supabase, clients = [], firstName = "", onClose }) {
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
  const hasAnswer = Boolean(intent && (facts.length || team));
  useEffect(() => { setShowAll(false); }, [typed]);

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

      <div className="assistant-window-body">
        <div className="assistant-bubble">
          <strong>¡Hola{firstName ? `, ${firstName}` : ""}!</strong> ¿Qué necesitás saber? Escribí un producto, un uso, un cliente o un competidor y te muestro lo que hay cargado.
        </div>
        {!typed && (
          <div className="assistant-chips" aria-label="Sugerencias">
            {SUGGESTIONS.map((text) => <button key={text} type="button" onClick={() => setQuery(text)}>{text}</button>)}
          </div>
        )}
        {typed && result.total === 0 && !hasAnswer && <div className="assistant-bubble muted">No encontré nada con “{typed}”. Probá con otra palabra o más corta.</div>}
        {hasAnswer && <Answer intent={intent} facts={facts} team={team} product={productWords(typed, intent).join(" ")} />}
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
        <label className="assistant-input">
          <Search size={17} />
          <input ref={inputRef} aria-label="Preguntale al asistente" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: cuánto rinde la epoxi" />
        </label>
        <small className="muted">Responde con lo cargado y con lo que ya respondimos en Mercado Libre. Muy pronto también va a conversar.</small>
      </footer>
    </aside>
  );
}
