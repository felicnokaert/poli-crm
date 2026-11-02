import { useState } from "react";
import { adminFetch } from "./admin-api.mjs";
import { supabase } from "./online.js";
import { loadReplyKnowledge } from "./reply-knowledge.mjs";

// Respuesta sugerida de WhatsApp (29/10, etapa 1): borrador bajo demanda con IA. El CRM no envía nada: la persona lo
// edita, lo copia y lo manda ella. Cada pedido gasta un poco del crédito de la IA, por eso solo corre al tocar el botón.
export function ReplySuggester({ event, context }) {
  const [state, setState] = useState({ status: "idle", draft: "", review: "", error: "" });
  const [copied, setCopied] = useState(false);
  // 3/11: "como asistente al cliente" prueba el perfil cliente (mensaje corto, deriva solo) en modo borrador; el CRM sigue sin enviar nada.
  const [asClient, setAsClient] = useState(false);

  async function suggest() {
    setState({ status: "loading", draft: "", review: "", error: "" });
    try {
      // Lo que ya sabe el CRM del tema (Mercado Libre, lo enseñado y precios de lista); si falla, el borrador sale igual.
      const today = new Date().toISOString().slice(0, 10);
      const knowledge = await loadReplyKnowledge(supabase, event.text_body, {
        today,
        loadPrices: async (client, words, day) => (await import("./AssistantWindow.jsx")).loadListPrices(client, words, day),
      }).catch(() => "");
      const response = await adminFetch({
        action: "assistant",
        mode: asClient ? "cliente" : "respuesta",
        question: event.text_body || "",
        transcript: event.transcript || "",
        context: [context, knowledge].filter(Boolean).join("\n"),
        today,
      });
      const body = await response.json().catch(() => null);
      if (!body?.ok) {
        const reason = body?.reason === "sin-clave" || body?.reason === "sin-credito"
          ? "La IA no está disponible ahora (falta clave o crédito)."
          : body?.error || "No se pudo generar la respuesta. Probá de nuevo.";
        setState({ status: "error", draft: "", review: "", error: reason });
        return;
      }
      setState({ status: "ready", draft: body.draft || "", review: body.review || "", derive: body.derive || "", attach: body.attach || [], error: "" });
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
      <label className="muted small" style={{ marginLeft: 8 }}>
        <input type="checkbox" checked={asClient} onChange={(e) => setAsClient(e.target.checked)} /> Probar como asistente al cliente
      </label>
      <span className="muted small"> Es un borrador: lo revisás, lo copiás y lo enviás vos. El CRM no manda nada.</span>
      {state.status === "error" && <p className="copilot-suggestion-pending" role="alert">{state.error}</p>}
      {state.status === "ready" && (
        <div className="reply-draft">
          <label>
            Borrador (editable)
            <textarea rows={5} value={state.draft} onChange={(e) => setState({ ...state, draft: e.target.value })} />
          </label>
          {state.derive && <p className="copilot-suggestion-pending">Derivaría a: {state.derive}</p>}
          {state.attach?.length > 0 && <p className="copilot-suggestion-pending">Adjuntaría: {state.attach.join(", ")}</p>}
          {state.review && <p className="copilot-suggestion-pending">Para revisar: {state.review}</p>}
          <button type="button" className="primary" onClick={copy}>{copied ? "Copiado" : "Copiar para WhatsApp"}</button>
        </div>
      )}
    </div>
  );
}
