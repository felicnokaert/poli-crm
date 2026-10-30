import { useEffect, useState } from "react";
import { Check, Copy, Mail, Pause, Play, RefreshCw, Send, Trash2, Wand2 } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { gmailLink, mailtoLink, updateMail } from "./mail-sequence.mjs";

const STATE_LABEL = { borrador: "Borrador", aprobado: "Aprobado", enviado: "Enviado", descartado: "Descartado" };

// Prospección → Bandeja de salida (plan estilo Harvey): mails de 3 pasos por prospecto.
// Una persona revisa y aprueba cada mail. Con Gmail conectado (31/10) «Enviar» sale desde su propia casilla; sin conectar, se abre el borrador en Gmail.
// El servidor frena por pausa, No contactar, horario (lun a vie 9 a 18), límite diario, rebote y respuesta.
async function gmailCall(body, session) {
  const response = await adminFetch({ action: "gmail", ...body }, session?.access_token);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`);
  return json;
}

const KIND_LABEL = { baja: "Pidió la baja", rebote: "Rebotó", "otro-contacto": "Pasó otro contacto", "no-interesa": "No le interesa", interesado: "Interesado", revisar: "Para leer" };

export function OutboxPanel({ outbox, onChange, onArmQueue, queueCount, account, session, onReplies, onOtherContact }) {
  const [filter, setFilter] = useState("borrador");
  const [message, setMessage] = useState("");
  const [gmail, setGmail] = useState(null);
  const [busy, setBusy] = useState("");
  const reload = () => gmailCall({ op: "status" }, session).then(setGmail).catch(() => setGmail({ enabled: false }));
  useEffect(() => { if (session) reload(); }, [session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps
  const connected = Boolean(gmail?.enabled && gmail?.connected);
  const list = Array.isArray(outbox) ? outbox : [];
  const counts = Object.fromEntries(Object.keys(STATE_LABEL).map((state) => [state, list.filter((item) => item.state === state).length]));
  const shown = list.filter((item) => item.state === filter).sort((a, b) => String(a.dueOn).localeCompare(String(b.dueOn)) || String(a.company).localeCompare(String(b.company)) || a.step - b.step);
  const patch = (id, change) => onChange(updateMail(list, id, change));
  const connect = async () => {
    try { const { url } = await gmailCall({ op: "authUrl" }, session); window.location.href = url; } catch (error) { setMessage(error.message); }
  };
  // Devuelve true si salió, o el motivo por el que el servidor lo frenó.
  const sendOne = async (item) => {
    const result = await gmailCall({ op: "send", item }, session);
    if (!result.sent) return result.reason || "No salió.";
    onChange(updateMail(list, item.id, { state: "enviado", sentAt: new Date().toISOString(), sentVia: "gmail" }));
    setGmail((current) => ({ ...current, sentToday: result.sentToday }));
    return true;
  };
  const sendNow = async (item) => {
    if (typeof window !== "undefined" && window.confirm && !window.confirm(`Se envía ahora a ${item.to} desde ${gmail.email}. ¿Seguimos?`)) return;
    setBusy(item.id); setMessage("");
    try { const result = await sendOne(item); setMessage(result === true ? "Enviado." : `No salió: ${result}`); } catch (error) { setMessage(error.message); }
    setBusy(""); reload();
  };
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const dueToday = list.filter((item) => item.state === "aprobado" && String(item.dueOn) <= today && (item.step === 1 || list.some((other) => other.prospectId === item.prospectId && other.step === 1 && other.state === "enviado")));
  const sendDue = async () => {
    if (typeof window !== "undefined" && window.confirm && !window.confirm(`Se envían hasta ${dueToday.length} mail(s) aprobados que ya tocan, desde ${gmail.email}. Se frena solo si llega al límite o al horario. ¿Seguimos?`)) return;
    setBusy("todos"); setMessage("");
    let sent = 0; let stopped = "";
    let current = list;
    for (const item of dueToday) {
      try {
        const result = await gmailCall({ op: "send", item: current.find((x) => x.id === item.id) || item }, session);
        if (!result.sent) { stopped = result.reason || "el servidor lo frenó"; if (/límite|horario|Fin de semana|pausa/.test(stopped)) break; continue; }
        current = updateMail(current, item.id, { state: "enviado", sentAt: new Date().toISOString(), sentVia: "gmail" }); onChange(current); sent += 1;
      } catch (error) { stopped = error.message; break; }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setMessage(`Se enviaron ${sent} mail(s).${stopped ? ` Se frenó: ${stopped}` : ""}`); setBusy(""); reload();
  };
  const checkReplies = async () => {
    setBusy("respuestas"); setMessage("");
    try {
      const result = await gmailCall({ op: "check-replies" }, session);
      const lines = result.replies?.length ? onReplies?.(result.replies) : [];
      setMessage(result.replies?.length ? `Respuestas nuevas: ${lines.join(" · ")}` : `Revisé ${result.checked} conversación(es): sin respuestas nuevas.`);
    } catch (error) { setMessage(error.message); }
    setBusy("");
  };
  const togglePause = async () => { try { await gmailCall({ op: "pause", paused: !gmail.paused }, session); reload(); } catch (error) { setMessage(error.message); } };
  const copy = async (item) => { try { await navigator.clipboard.writeText(`${item.subject}\n\n${item.body}`); setMessage("Copiado."); } catch { setMessage("No se pudo copiar: seleccioná el texto a mano."); } };
  return (
    <section className="panel outbox-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Mails en 3 pasos por prospecto</span>
          <h2><Mail size={18} aria-hidden="true" /> Bandeja de salida</h2>
          <p className="muted small">El CRM arma el texto y vos decidís. Nada sale solo: revisá, aprobá y mandalo desde tu Gmail con «Abrir en Gmail». Si el destinatario está en No contactar, el borrador se descarta solo.</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="primary" onClick={() => setMessage(onArmQueue())} disabled={!queueCount}><Wand2 size={15} /> Armar para los primeros de la cola ({queueCount})</button>
        </div>
      </div>
      {gmail?.enabled && (
        <div className="outbox-gmail" role="group" aria-label="Conexión con Gmail">
          {connected ? (
            <>
              <span><strong>Gmail conectado</strong> · {gmail.email} · hoy {gmail.sentToday}/{gmail.limit}{gmail.paused ? " · en pausa" : ""}</span>
              <button type="button" className="secondary" onClick={sendDue} disabled={Boolean(busy) || gmail.paused || !dueToday.length}><Send size={15} /> Enviar los aprobados que tocan hoy ({dueToday.length})</button>
              <button type="button" className="secondary" onClick={checkReplies} disabled={Boolean(busy)}><RefreshCw size={15} /> Buscar respuestas</button>
              <button type="button" className="secondary" onClick={togglePause}>{gmail.paused ? <><Play size={15} /> Reanudar envíos</> : <><Pause size={15} /> Pausar envíos</>}</button>
            </>
          ) : (
            <>
              <span>Para enviar desde el CRM, conectá tu Gmail de grupopoliplast.com.ar (se pide una sola vez).</span>
              <button type="button" className="primary" onClick={connect}><Mail size={15} /> Conectar mi Gmail</button>
            </>
          )}
          {gmail.lastError && <span className="muted small">{gmail.lastError}</span>}
        </div>
      )}
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
              {item.reply && <p className="outbox-reply" role="note"><strong>{KIND_LABEL[item.reply.kind] || "Respondió"}:</strong> {item.reply.snippet} <span className="muted small">→ {item.reply.action}{item.reply.emails?.length ? ` (${item.reply.emails.join(", ")})` : ""}</span>{item.reply.kind === "otro-contacto" && (item.reply.emails || []).map((address) => <button key={address} type="button" className="secondary" onClick={() => setMessage(onOtherContact?.(item, address) || "")}>Armar mails para {address}</button>)}</p>}
              {item.sentVia === "gmail" && <span className="muted small">Enviado desde el CRM{item.sentAt ? ` el ${item.sentAt.slice(0, 10)}` : ""}</span>}
              <label className="outbox-field">Asunto
                <input value={item.subject} onChange={(event) => patch(item.id, { subject: event.target.value })} disabled={item.state === "enviado"} />
              </label>
              <label className="outbox-field">Mensaje
                <textarea rows={8} value={item.body} onChange={(event) => patch(item.id, { body: event.target.value })} disabled={item.state === "enviado"} />
              </label>
              <div className="queue-actions">
                {item.state === "borrador" && <button type="button" className="primary" onClick={() => patch(item.id, { state: "aprobado" })}><Check size={15} /> Aprobar</button>}
                {item.state === "aprobado" && connected && <button type="button" className="primary" onClick={() => sendNow(item)} disabled={Boolean(busy) || gmail.paused}><Send size={15} /> {busy === item.id ? "Enviando…" : "Enviar ahora"}</button>}
                {item.state === "aprobado" && <a className={connected ? "secondary link-pill" : "primary link-pill"} href={gmailLink(item, account)} target="_blank" rel="noreferrer">{connected ? "Abrir en Gmail" : <><Send size={15} /> Abrir en Gmail</>}</a>}
                {item.state === "aprobado" && <a className="secondary link-pill" href={mailtoLink(item)}>Abrir en otro programa de correo</a>}
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
