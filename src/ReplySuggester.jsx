import { useState } from "react";
import { adminFetch } from "./admin-api.mjs";

// Respuesta sugerida de WhatsApp (29/10, etapa 1): borrador bajo demanda con IA. El CRM no envía nada: la persona lo
// edita, lo copia y lo manda ella. Cada pedido gasta un poco del crédito de la IA, por eso solo corre al tocar el botón.
export function ReplySuggester({ event, context }) {
  const [state, setState] = useState({ status: "idle", draft: "", review: "", error: "" });
  const [copied, setCopied] = useState(false);

  async function suggest() {
    setState({ status: "loading", draft: "", review: "", error: "" });
    try {
      const response = await adminFetch({
        action: "assistant",
        mode: "respuesta",
        question: event.text_body || "",
        transcript: event.transcript || "",
        context,
        today: new Date().toISOString().slice(0, 10),
      });
      const body = await response.json().catch(() => null);
      if (!body?.ok) {
        const reason = body?.reason === "sin-clave" || body?.reason === "sin-credito"
          ? "La IA no está disponible ahora (falta clave o crédito)."
          : body?.error || "No se pudo generar la respuesta. Probá de nuevo.";
        setState({ status: "error", draft: "", review: "", error: reason });
        return;
      }
      setState({ status: "ready", draft: body.draft || "", review: body.review || "", error: "" });
    } catch {
      setState({ status: "error", draft: "", review: "", error: "Sin conexión con el servidor. Probá de nuevo." });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="reply-suggester">
      <button type="button" className="secondary" onClick={suggest} disabled={state.status === "loading"}>
        {state.status === "loading" ? "Redactando…" : state.status === "ready" ? "Sugerir otra" : "Sugerir respuesta"}
      </button>
      <span className="muted small"> Es un borrador: lo revisás, lo copiás y lo enviás vos. El CRM no manda nada.</span>
      {state.status === "error" && <p className="copilot-suggestion-pending" role="alert">{state.error}</p>}
      {state.status === "ready" && (
        <div className="reply-draft">
          <label>
            Borrador (editable)
            <textarea rows={5} value={state.draft} onChange={(e) => setState({ ...state, draft: e.target.value })} />
          </label>
          {state.review && <p className="copilot-suggestion-pending">Para revisar: {state.review}</p>}
          <button type="button" className="primary" onClick={copy}>{copied ? "Copiado" : "Copiar para WhatsApp"}</button>
        </div>
      )}
    </div>
  );
}
