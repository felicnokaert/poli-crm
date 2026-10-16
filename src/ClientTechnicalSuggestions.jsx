import { useState } from "react";
import { FileText } from "lucide-react";
import { clientSuggestions } from "./technical-insights.mjs";

// «Qué le conviene» en la ficha de la empresa: las fichas de Base técnica de lo que ya compra y las
// que encajan con su familia y rubro. Se cargan al tocar el botón (no en cada apertura de la ficha).
export function ClientTechnicalSuggestions({ client, boughtProducts = [], repo = () => import("./technical-documents-repo.mjs") }) {
  const [state, setState] = useState(null);
  async function load() {
    setState({ loading: true });
    try {
      const { fetchTechnicalDocuments, getTechnicalDocumentFileUrl } = await repo();
      const docs = (await fetchTechnicalDocuments()).filter((doc) => !["desactualizado", "no_tecnico", "posible_duplicado"].includes(doc.status));
      setState({ result: clientSuggestions(client, docs, boughtProducts), openFile: getTechnicalDocumentFileUrl });
    } catch (error) {
      setState({ error: error.message || "No se pudo leer Base técnica." });
    }
  }
  async function open(doc) {
    const url = await state.openFile(doc.storagePath).catch(() => "");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }
  const item = ({ doc, because }) => (
    <article key={doc.id}>
      <h4><FileText size={14} /> {doc.title} {doc.status !== "vigente" && <span className="pill warn">sin validar</span>}</h4>
      <p className="muted small">Porque {because}. {doc.storagePath && <button type="button" className="link-button" onClick={() => open(doc)}>Ver documento</button>}</p>
    </article>
  );
  return (
    <div className="commercial-guidance client-suggestions">
      <div className="commercial-guidance-head">
        <div><span className="eyebrow">Base técnica</span><h3>Qué le conviene a esta empresa</h3></div>
        {!state?.result && <button type="button" className="secondary" disabled={state?.loading} onClick={load}>{state?.loading ? "Buscando…" : "Ver fichas sugeridas"}</button>}
      </div>
      {state?.error && <p className="system-message error">{state.error}</p>}
      {state?.result && (
        <>
          {state.result.own.length > 0 && <><p><strong>De lo que ya compra</strong></p>{state.result.own.map(item)}</>}
          {state.result.related.length > 0 && <><p><strong>Puede servirle</strong> <span className="muted small">(por su familia y rubro; confirmá la necesidad antes de ofrecer)</span></p>{state.result.related.map(item)}</>}
          {!state.result.own.length && !state.result.related.length && (
            <p className="muted">No encontré fichas para esta empresa. {state.result.boughtCount ? "Lo que compra todavía no tiene ficha cargada." : "Completá su familia, industria o producto principal para que pueda sugerir."}</p>
          )}
        </>
      )}
    </div>
  );
}
