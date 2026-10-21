import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { AssistantLogo } from "./AssistantLogo.jsx";
import { KNOWLEDGE_TYPES } from "./knowledge-search.mjs";
import { useKnowledge } from "./useKnowledge.js";

// Ventana del asistente (21/10): flotante, abajo a la derecha (en el celular ocupa la pantalla). Por ahora
// busca por palabras en todo lo que sabe el CRM, sin IA ni costo. Cuando se apruebe el presupuesto, esta
// misma ventana pasa a conversar; lo que ve el equipo no cambia.
const SUGGESTIONS = ["techo", "espuma aislante", "adhesivo", "poliurea", "envío", "rendimiento"];
const PER_GROUP = 3;

export function AssistantWindow({ supabase, clients = [], firstName = "", onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const { result } = useKnowledge(supabase, query, { clients });
  const groups = KNOWLEDGE_TYPES.filter(([key]) => result.groups[key]?.length);
  const typed = query.trim();

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
        {typed && result.total === 0 && <div className="assistant-bubble muted">No encontré nada con “{typed}”. Probá con otra palabra o más corta.</div>}
        {groups.map(([key, label]) => (
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
          <input ref={inputRef} aria-label="Preguntale al asistente" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: rendimiento espuma 40 kg" />
        </label>
        <small className="muted">Busca por palabras en lo cargado. Muy pronto también va a conversar.</small>
      </footer>
    </aside>
  );
}
