import { useState } from "react";
import { Ban, Plus, Undo2 } from "lucide-react";
import { BLOCK_KINDS, activeEntries, addManual, removeBlock } from "./do-not-contact.mjs";

const KIND_LABEL = { mail: "Mail", telefono: "Teléfono", dominio: "Sitio web", nombre: "Nombre" };

// Prospección → No contactar (30/10): quien pidió que no le escribamos. No entra en la Cola del día ni en la cola de prospectos.
// Quitar no borra: la entrada queda marcada como quitada para que no reaparezca desde otro navegador.
export function DoNotContactPanel({ list, onChange, userEmail }) {
  const entries = activeEntries(list);
  const [kind, setKind] = useState("mail");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const add = () => {
    const result = addManual(list, { kind, value, reason, by: userEmail });
    if (!result.added) { setMessage("Revisá el dato: no se pudo agregar (o ya estaba en la lista)."); return; }
    onChange(result.list); setValue(""); setReason(""); setMessage("Agregado. Esa persona ya no entra en las colas.");
  };
  return (
    <section className="panel dnc-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Respetar los pedidos de baja</span>
          <h2><Ban size={18} aria-hidden="true" /> No contactar</h2>
          <p className="muted small">Lo que está acá no entra en la Cola del día ni en la cola de prospectos. También se puede agregar desde cada prospecto con «No contactar nunca». Se compara por mail, teléfono (últimos 8 dígitos), sitio web y nombre.</p>
        </div>
      </div>
      <div className="dnc-form">
        <label>Tipo
          <select value={kind} onChange={(event) => setKind(event.target.value)}>{BLOCK_KINDS.map((item) => <option key={item} value={item}>{KIND_LABEL[item]}</option>)}</select>
        </label>
        <label>Dato
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === "mail" ? "nombre@empresa.com" : kind === "telefono" ? "11 5555 1234" : kind === "dominio" ? "empresa.com" : "Nombre de la empresa"} />
        </label>
        <label>Motivo (opcional)
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Pidió la baja por mail" />
        </label>
        <button type="button" className="primary" onClick={add} disabled={!value.trim()}><Plus size={15} /> Agregar</button>
      </div>
      {message && <p className="muted small" role="status">{message}</p>}
      {entries.length === 0 ? <p className="muted">Todavía no hay nadie en la lista.</p> : (
        <ul className="dnc-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="badge">{KIND_LABEL[entry.kind] || entry.kind}</span>
              <strong>{entry.kind === "telefono" ? `…${entry.value}` : entry.value}</strong>
              {entry.label && entry.label !== entry.value && <span className="muted small"> · {entry.label}</span>}
              {entry.reason && <span className="muted small"> · {entry.reason}</span>}
              <span className="muted small"> · {String(entry.at || "").slice(0, 10)}</span>
              <button type="button" className="ghost" onClick={() => onChange(removeBlock(list, entry.id))}><Undo2 size={14} /> Quitar</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
