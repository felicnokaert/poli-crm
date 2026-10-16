import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { globalSearch } from "./global-search.mjs";
import { useModalEscape } from "./app-shared";

const KIND_LABEL = { empresa: "Empresa", tarea: "Tarea", prospecto: "Prospecto" };

export function CommandPalette({ clients, tasks, prospects, onPick, onClose }) {
  useModalEscape(onClose);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const results = useMemo(() => globalSearch(query, { clients, tasks, prospects }), [query, clients, tasks, prospects]);
  function onKey(event) {
    if (event.key === "ArrowDown") { event.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter" && results[index]) { event.preventDefault(); onPick(results[index]); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal command-palette" role="dialog" aria-label="Búsqueda global" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <label className="search">
            <Search size={17} />
            <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} onKeyDown={onKey} placeholder="Buscar empresa, tarea o prospecto…" />
          </label>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X /></button>
        </div>
        {!query.trim() && <p className="muted small">Escribí parte de un nombre, ciudad o teléfono. ↑ ↓ para moverte, Enter para abrir.</p>}
        {query.trim() && results.length === 0 && <p className="muted">Sin resultados.</p>}
        <ul className="palette-list">
          {results.map((item, i) => (
            <li key={`${item.kind}-${item.id}`}>
              <button type="button" className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onClick={() => onPick(item)}>
                <span className="palette-kind">{KIND_LABEL[item.kind]}</span>
                <strong>{item.title}</strong>
                {item.subtitle && <span className="muted small">{item.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
