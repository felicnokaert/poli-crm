import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Más → Datos → Conexiones → «Respuesta automática de WhatsApp» (3/11, Felipe): PRUEBA acotada a los contactos que se habiliten acá.
// Apagada por defecto. Usa el perfil «cliente» del asistente y deja un registro de cada mensaje para ver qué contestó y por qué.
const when = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function WhatsAppAutoReply() {
  const [state, setState] = useState({ loaded: false, enabled: false, mode: "lista", contacts: [], channels: ["general"], log: [], tokenLoaded: true });
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(body) {
    setBusy(true);
    try {
      const response = await adminFetch({ action: "whatsapp-auto", ...body });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) { setMessage(data?.error || "No se pudo."); return null; }
      setState({ loaded: true, enabled: data.enabled, mode: data.mode || "lista", contacts: data.contacts || [], channels: data.channels || ["general"], log: data.log || [], tokenLoaded: data.tokenLoaded !== false });
      if (data.test) setMessage(`Prueba de envío: ${data.test}`);
      return data;
    } catch { setMessage("Sin conexión con el servidor."); return null; } finally { setBusy(false); }
  }
  useEffect(() => { call({ op: "status" }); /* eslint-disable-next-line */ }, []);

  const save = (patch) => call({ op: "save", enabled: state.enabled, mode: state.mode, contacts: state.contacts, channels: state.channels, ...patch });
  const toggleChannel = (key) => save({ channels: state.channels.includes(key) ? state.channels.filter((item) => item !== key) : [...state.channels, key] });
  const addContact = () => {
    if (!number.replace(/\D/g, "")) return;
    save({ contacts: [...state.contacts, { wa: number, name }] }).then(() => { setNumber(""); setName(""); });
  };

  return (
    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Prueba · solo contactos habilitados</span><h2>Respuesta automática de WhatsApp</h2></div></div>
      <p className="muted small">Cuando un contacto de esta lista escribe al número general, el asistente le contesta solo (mensaje corto, sin inventar precios ni stock, y avisa cuando hace falta una persona). Los demás contactos no se tocan. Mensajes de texto, dentro de las 24 horas.</p>
      {!state.tokenLoaded && <p className="copilot-suggestion-pending">Falta cargar META_SYSTEM_USER_TOKEN en Vercel: sin eso no puede enviar.</p>}
      <label>Quién recibe respuesta automática
        <select value={state.mode} disabled={busy} onChange={(e) => { if (e.target.value === "todos" && !window.confirm("Con esta opción el asistente le contesta SOLO a todos los contactos de Por revisar, excepto los marcados como no comerciales. ¿Seguro? Conviene probar primero con tu contacto.")) return; save({ mode: e.target.value }); }}>
          <option value="lista">Solo los contactos de la lista (prueba)</option>
          <option value="todos">Todos los contactos, menos los marcados «no comercial»</option>
        </select>
      </label>
      <fieldset className="channel-picks">
        <legend>En qué líneas contesta</legend>
        {[["general", "General"], ["penosil", "Penosil"], ["rapyp", "RAPYP"]].map(([key, label]) => (
          <label key={key}><input type="checkbox" checked={state.channels.includes(key)} disabled={busy} onChange={() => toggleChannel(key)} /> {label}</label>
        ))}
        <span className="muted small">Una línea nueva no contesta sola hasta que la tildes. Penosil y RAPYP todavía no están conectadas a Meta.</span>
      </fieldset>
      <label><input type="checkbox" checked={state.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} /> <strong>{state.enabled ? "Prendida" : "Apagada"}</strong></label>
      <ul>{state.contacts.map((contact, index) => (
        <li key={contact.wa}>{contact.name || "Contacto"} · +{contact.wa} <button type="button" className="danger-link" onClick={() => save({ contacts: state.contacts.filter((_, i) => i !== index) })}>Quitar</button></li>
      ))}</ul>
      <div className="form-grid">
        <label>Número (con código de país)<input value={number} placeholder="5491150000000" onChange={(e) => setNumber(e.target.value)} /></label>
        <label>Nombre<input value={name} placeholder="Felipe (prueba)" onChange={(e) => setName(e.target.value)} /></label>
      </div>
      <div className="panel-head-actions">
        <button type="button" className="secondary" disabled={busy} onClick={addContact}>Agregar contacto</button>
        <button type="button" className="secondary" disabled={busy || !state.contacts.length} onClick={() => call({ op: "test" })}>Mandarme un mensaje de prueba</button>
      </div>
      {message && <div className="system-message">{message}</div>}
      <h3>Lo que contestó</h3>
      <p className="muted small">Acá solo queda cuándo y a qué contacto. El texto de cada respuesta está en la conversación, en Por revisar.</p>
      {!state.log.length && <p className="muted small">Todavía no contestó nada.</p>}
      <ul>{state.log.map((entry) => (
        <li key={`${entry.event_id}-${entry.at}`}>
          <strong>{when(entry.at)} · {entry.status === "enviado" ? "Enviado" : "Error"}</strong> · contacto …{String(entry.wa || "").slice(-4)}
          {entry.derive && <><br /><span className="muted small">Derivaría a: {entry.derive}</span></>}
          {entry.error && <><br /><span className="copilot-suggestion-pending">{entry.error}</span></>}
        </li>
      ))}</ul>
    </section>
  );
}
