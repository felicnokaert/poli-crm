import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Pausa global de lo automático (4/11): apaga a la vez la respuesta automática de WhatsApp y el envío automático de Gmail.
// Solo administradores. Lo manual (botones de una persona) no se frena.
const when = (iso) => { try { return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

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
      </div>
    );
  }
  return (
    <div className="automation-pause">
      <button type="button" className="danger-link" disabled={busy} onClick={() => { if (window.confirm("¿Pausar TODO lo automático (respuesta de WhatsApp y envío de Gmail)? Lo que hagan las personas a mano sigue funcionando. Podés reanudar cuando quieras.")) call({ op: "set", paused: true }); }}>Pausar todo lo automático</button>
      {error && <span className="muted small"> {error}</span>}
    </div>
  );
}
