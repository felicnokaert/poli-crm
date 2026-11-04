import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Pausa global de lo automático (4/11): apaga a la vez la respuesta automática de WhatsApp y el envío automático de Gmail.
// Solo administradores. Lo manual (botones de una persona) no se frena.
const when = (iso) => { try { return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function Activity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const response = await adminFetch({ action: "automation-pause", op: "activity" });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) { setError(body?.error || "No se pudo."); return; }
      setData(body);
    } catch { setError("Sin conexión con el servidor."); }
  }
  return (
    <details className="automation-activity" onToggle={(event) => { if (event.target.open && !data) load(); }}>
      <summary>Ver lo que hizo el CRM solo (últimos 7 días)</summary>
      {error && <p className="muted small">{error}</p>}
      {data && (
        <>
          <h4>Respuestas automáticas de WhatsApp ({data.whatsapp.length})</h4>
          {!data.whatsapp.length && <p className="muted small">Ninguna.</p>}
          <ul>{data.whatsapp.map((item, index) => <li key={index}><strong>{when(item.at)}</strong> · {item.channel} · {item.name || `…${item.wa}`}: {item.text}</li>)}</ul>
          <h4>Mails enviados por Gmail ({data.gmail.length})</h4>
          {!data.gmail.length && <p className="muted small">Ninguno.</p>}
          <ul>{data.gmail.map((item, index) => <li key={index}><strong>{when(item.at)}</strong> · {item.from} → {item.to}{item.company ? ` (${item.company})` : ""} · paso {item.step}{item.reply ? ` · respondió: ${item.reply}` : ""}</li>)}</ul>
          <p className="muted small">Si algo salió mal, pausá todo lo automático y avisame qué fue para corregirlo.</p>
        </>
      )}
    </details>
  );
}

export function AutomationPause() {
  const [state, setState] = useState({ loaded: false, paused: false, by: "", at: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function call(body) {
    setBusy(true); setError("");
    try {
      const response = await adminFetch({ action: "automation-pause", ...body });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) { setError(data?.error || "No se pudo."); return; }
      setState({ loaded: true, paused: data.paused === true, by: data.by || "", at: data.at || "" });
    } catch { setError("Sin conexión con el servidor."); } finally { setBusy(false); }
  }
  useEffect(() => { call({ op: "status" }); /* eslint-disable-next-line */ }, []);
  if (!state.loaded && !error) return null;
  if (state.paused) {
    return (
      <div className="system-message automation-pause paused" role="status">
        <strong>Lo automático está EN PAUSA</strong> (respuesta automática de WhatsApp y envío automático de Gmail){state.by ? ` · lo pausó ${state.by.split("@")[0]}` : ""}{state.at ? ` el ${when(state.at)}` : ""}.{" "}
        <button type="button" className="primary" disabled={busy} onClick={() => call({ op: "set", paused: false })}>Reanudar</button>
        <Activity />
      </div>
    );
  }
  return (
    <div className="automation-pause">
      <button type="button" className="danger-link" disabled={busy} onClick={() => { if (window.confirm("¿Pausar TODO lo automático (respuesta de WhatsApp y envío de Gmail)? Lo que hagan las personas a mano sigue funcionando. Podés reanudar cuando quieras.")) call({ op: "set", paused: true }); }}>Pausar todo lo automático</button>
      {error && <span className="muted small"> {error}</span>}
      <Activity />
    </div>
  );
}
