import { useMemo, useState } from "react";
import { Download, Eraser, Undo2 } from "lucide-react";
import { CONTACT_LABEL, FIT_LABEL, FABRICANTE_OUTCOME, classifyAll, cleanupCsv, cleanupSummary } from "./prospect-cleanup.mjs";

const PAGE = 60;

// Prospección → Limpieza (12/11): separa los prospectos pendientes por tipo de teléfono y por encaje con el negocio.
// Solo sugiere: descartar es un toque (queda como «Sin interés» con motivo, se puede deshacer) y «Dejar» lo conserva.
export function ProspectCleanup({ prospects, onDiscard, onKeep }) {
  const [contact, setContact] = useState("todos");
  const [fit, setFit] = useState("todos");
  const [family, setFamily] = useState("todas");
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const summary = useMemo(() => cleanupSummary(prospects), [prospects]);
  const pending = useMemo(() => classifyAll(prospects).filter((row) => row.status === "pendiente"), [prospects]);
  const families = useMemo(() => [...new Set(pending.map((row) => row.prospect.family).filter(Boolean))].sort(), [pending]);
  const filtered = useMemo(() => {
    const query = text.trim().toLowerCase();
    return pending.filter((row) => (contact === "todos" || row.contact === contact)
      && (fit === "todos" || row.fit === fit)
      && (family === "todas" || row.prospect.family === family)
      && (!query || `${row.prospect.company} ${row.prospect.city} ${row.prospect.rubro}`.toLowerCase().includes(query)));
  }, [pending, contact, fit, family, text]);
  const toDrop = pending.filter((row) => row.fit === "bajar");
  const download = () => {
    const blob = new Blob([cleanupCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = "limpieza-prospectos.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const dropAll = () => {
    if (!toDrop.length || !window.confirm(`Descartar los ${toDrop.length} prospectos «para bajar»? Quedan como «Sin interés» con su motivo y podés deshacerlo.`)) return;
    const groups = new Map();
    for (const row of toDrop) {
      const outcome = row.outcome || FABRICANTE_OUTCOME;
      groups.set(outcome, [...(groups.get(outcome) || []), row.prospect.id]);
    }
    for (const [outcome, ids] of groups) onDiscard(ids, outcome);
  };
  const cards = [
    ["Pendientes", summary.pending, "sin contactar"],
    ["Celular", summary.celular, "WhatsApp"],
    ["Fijo", summary.fijo, "llamar o probar"],
    ["Sin teléfono", summary.sinTelefono, "descartar o buscar"],
    ["Prioridad", summary.alta, "encajan"],
    ["Para bajar", summary.bajar, "no son perfil"],
    ["Revisar", summary.revisar, "a mano"],
  ];
  return (
    <section className="panel prospect-cleanup" aria-label="Limpieza de prospectos">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Qué prospectos sirven</span>
          <h2><Eraser size={18} aria-hidden="true" /> Limpieza de prospectos</h2>
          <p className="muted small">
            Ordena los {summary.pending} prospectos sin contactar. No aparecen acá los que ya son clientes ({summary.clients}) ni los que ya trabajaste ({summary.inProgress + summary.closed}).
            Criterio de Resinplast: vendemos fraccionado, así que el perfil es reparación, parchado, carpintería y talleres; el fabricante de piletas o de lanchas compra por tambor y queda «para bajar».
          </p>
        </div>
      </div>
      <div className="cleanup-cards">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="cleanup-card"><strong>{value}</strong><span>{label}</span><small className="muted">{hint}</small></div>
        ))}
      </div>
      <div className="cleanup-filters">
        <label>Teléfono
          <select value={contact} onChange={(event) => { setContact(event.target.value); setLimit(PAGE); }}>
            <option value="todos">Todos</option>
            {Object.entries(CONTACT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>Encaje
          <select value={fit} onChange={(event) => { setFit(event.target.value); setLimit(PAGE); }}>
            <option value="todos">Todos</option>
            <option value="alta">Prioridad</option>
            <option value="normal">Sin juicio</option>
            <option value="revisar">Revisar</option>
            <option value="bajar">Para bajar</option>
            <option value="conservado">Conservados</option>
          </select>
        </label>
        <label>Familia
          <select value={family} onChange={(event) => { setFamily(event.target.value); setLimit(PAGE); }}>
            <option value="todas">Todas</option>
            {families.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>Buscar
          <input value={text} onChange={(event) => { setText(event.target.value); setLimit(PAGE); }} placeholder="Empresa, ciudad o rubro" />
        </label>
      </div>
      <div className="cleanup-actions">
        <button type="button" className="primary" onClick={dropAll} disabled={!toDrop.length}>Descartar los {toDrop.length} «para bajar»</button>
        <button type="button" className="secondary" onClick={download} disabled={!filtered.length}><Download size={15} /> Descargar esta lista (CSV)</button>
        <span className="muted small">{filtered.length} de {pending.length} a la vista</span>
      </div>
      <div className="cleanup-list">
        {filtered.slice(0, limit).map((row) => (
          <article key={row.prospect.id} className={`cleanup-row fit-${row.fit}`}>
            <div className="cleanup-main">
              <strong>{row.prospect.company || "Sin nombre"}</strong>
              <span className="muted small">{[row.prospect.family, row.prospect.rubro, [row.prospect.city, row.prospect.province].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
              <span className="small">{row.prospect.phone ? `${row.prospect.phone} · ` : ""}{CONTACT_LABEL[row.contact]}</span>
              {row.reason && <span className="small cleanup-reason">{FIT_LABEL[row.fit] ? `${FIT_LABEL[row.fit]}: ` : ""}{row.reason}</span>}
            </div>
            <div className="cleanup-buttons">
              <button type="button" className="secondary" onClick={() => onDiscard([row.prospect.id], row.outcome || FABRICANTE_OUTCOME)}>Descartar</button>
              {(row.fit === "bajar" || row.fit === "revisar") && <button type="button" className="link-button" onClick={() => onKeep([row.prospect.id])}><Undo2 size={14} /> Dejar</button>}
            </div>
          </article>
        ))}
        {!filtered.length && <p className="muted">No hay prospectos con ese filtro.</p>}
        {filtered.length > limit && <button type="button" className="secondary" onClick={() => setLimit(limit + PAGE)}>Mostrar {Math.min(PAGE, filtered.length - limit)} más</button>}
      </div>
    </section>
  );
}
