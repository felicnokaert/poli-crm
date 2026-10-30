import { useState } from "react";
import { Check, Copy, Mail, Send, Trash2, Wand2 } from "lucide-react";
import { mailtoLink, updateMail } from "./mail-sequence.mjs";

const STATE_LABEL = { borrador: "Borrador", aprobado: "Aprobado", enviado: "Enviado", descartado: "Descartado" };

// Prospección → Bandeja de salida (etapa 2 del plan estilo Harvey, 30/10): mails en borrador de 3 pasos por prospecto.
// El CRM NO envía: una persona revisa, aprueba y lo manda desde su correo ("Abrir en mi correo"), y después lo marca como enviado.
export function OutboxPanel({ outbox, onChange, onArmQueue, queueCount }) {
  const [filter, setFilter] = useState("borrador");
  const [message, setMessage] = useState("");
  const list = Array.isArray(outbox) ? outbox : [];
  const counts = Object.fromEntries(Object.keys(STATE_LABEL).map((state) => [state, list.filter((item) => item.state === state).length]));
  const shown = list.filter((item) => item.state === filter).sort((a, b) => String(a.dueOn).localeCompare(String(b.dueOn)) || String(a.company).localeCompare(String(b.company)) || a.step - b.step);
  const patch = (id, change) => onChange(updateMail(list, id, change));
  const copy = async (item) => { try { await navigator.clipboard.writeText(`${item.subject}\n\n${item.body}`); setMessage("Copiado."); } catch { setMessage("No se pudo copiar: seleccioná el texto a mano."); } };
  return (
    <section className="panel outbox-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Mails en 3 pasos por prospecto</span>
          <h2><Mail size={18} aria-hidden="true" /> Bandeja de salida</h2>
          <p className="muted small">El CRM arma el texto y vos decidís. Nada sale solo: revisá, aprobá y mandalo desde tu correo con «Abrir en mi correo». Si el destinatario está en No contactar, el borrador se descarta solo.</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="primary" onClick={() => setMessage(onArmQueue())} disabled={!queueCount}><Wand2 size={15} /> Armar para los primeros de la cola ({queueCount})</button>
        </div>
      </div>
      {message && <p className="muted small" role="status">{message}</p>}
      <div className="segmented" role="tablist" aria-label="Estado de los mails">
        {Object.entries(STATE_LABEL).map(([state, label]) => (
          <button key={state} type="button" role="tab" aria-selected={filter === state} className={filter === state ? "selected" : ""} onClick={() => setFilter(state)}>{label} ({counts[state]})</button>
        ))}
      </div>
      {shown.length === 0 ? <p className="muted">No hay mails en «{STATE_LABEL[filter]}». Armalos desde la cola o desde la ficha de un prospecto con mail.</p> : (
        <ul className="outbox-list">
          {shown.map((item) => (
            <li key={item.id} className="outbox-item">
              <div className="outbox-head">
                <strong>{item.company || item.to}</strong>
                <span className="badge">Paso {item.step} · {item.stepName}</span>
                <span className="muted small">Para: {item.to} · le toca el {item.dueOn}{item.note ? ` · ${item.note}` : ""}</span>
              </div>
              <label className="outbox-field">Asunto
                <input value={item.subject} onChange={(event) => patch(item.id, { subject: event.target.value })} disabled={item.state === "enviado"} />
              </label>
              <label className="outbox-field">Mensaje
                <textarea rows={8} value={item.body} onChange={(event) => patch(item.id, { body: event.target.value })} disabled={item.state === "enviado"} />
              </label>
              <div className="queue-actions">
                {item.state === "borrador" && <button type="button" className="primary" onClick={() => patch(item.id, { state: "aprobado" })}><Check size={15} /> Aprobar</button>}
                {item.state === "aprobado" && <a className="primary link-pill" href={mailtoLink(item)}><Send size={15} /> Abrir en mi correo</a>}
                {item.state === "aprobado" && <button type="button" className="secondary" onClick={() => patch(item.id, { state: "enviado", sentAt: new Date().toISOString() })}>Ya lo mandé</button>}
                {item.state === "aprobado" && <button type="button" className="secondary" onClick={() => patch(item.id, { state: "borrador" })}>Volver a borrador</button>}
                <button type="button" className="secondary" onClick={() => copy(item)}><Copy size={15} /> Copiar</button>
                {item.state !== "descartado" && item.state !== "enviado" && <button type="button" className="danger-link" onClick={() => patch(item.id, { state: "descartado" })}><Trash2 size={15} /> Descartar</button>}
                {item.state === "descartado" && <button type="button" className="secondary" onClick={() => patch(item.id, { state: "borrador", note: "" })}>Recuperar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
