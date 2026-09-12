import { useEffect, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { inferIntent } from "./commercial-intelligence.mjs";
import { buildSuggestion, PENDING_LABEL } from "./suggestion-rules.mjs";
import { prepareManualQuery } from "./ai-provider.mjs";
import { docTypeLabel } from "./technical-library.mjs";
import { FAMILIES } from "./families.mjs";
import { TRIAGE_VARIABLES, scoreTriage } from "./commercial-triage.mjs";
import { shouldCreateFollowup } from "./followup-policy.mjs";
import { CHANNELS, INTENTS, PIPELINE, commercialStage, useModalEscape } from "./app-shared";

export function LegacyInboxRow({ item, onDelete }) {
  const name =
    item.customer_name || item.customer_wa_id || "Origen sin identificar";
  return (
    <article className={`legacy-inbox-row channel-${item.channel}`}>
      <span
        className="channel-dot"
        style={{ background: CHANNELS[item.channel]?.color || "#7d8790" }}
      />
      <div>
        <strong>{name}</strong>
        <span>
          {CHANNELS[item.channel]?.name || "WhatsApp"} · captura anterior ·{" "}
          {item.messageCount || 1} mensajes
        </span>
        <p>{item.text_body || "[sin texto]"}</p>
      </div>
      <button className="danger-link" onClick={() => onDelete(item.event_id)}>
        Quitar captura
      </button>
    </article>
  );
}

export function InboxRow({
  item,
  onClassify,
  onDraft,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onExclude,
  onRestoreCommercial,
  selected,
  onToggleSelected,
}) {
  const [showActions, setShowActions] = useState(false);
  const pending = item.classification_status === "pending";
  const archived = item.classification_status === "archived";
  const labels = {
    ignored: "No requiere acción",
    memory: "Contexto guardado",
    followup: "Tarea creada",
    training: "Enviado al entrenador",
    confirmed: "Borrador confirmado",
    archived: "Archivada",
    excluded: `No comercial${item.excludedCategory ? ` · ${item.excludedCategory}` : ""}`,
  };
  const name =
    item.customer_name || item.customer_wa_id || "Contacto sin identificar";
  const intent = inferIntent(item.text_body);
  const channelNames = (item.channels || [item.channel])
    .map((key) => CHANNELS[key]?.name || "WhatsApp")
    .join(" + ");
  const occurred = new Date(item.occurred_at);
  const dateTime = `${occurred.toLocaleDateString("es-AR")} · ${occurred.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} hs`;
  const excludeSelect = (
    <select
      className="contact-exclusion"
      defaultValue=""
      aria-label={`Marcar ${name} como contacto no comercial`}
      onChange={(event) => {
        onExclude?.(item.event_id, event.target.value);
        event.target.value = "";
      }}
    >
      <option value="">No es cliente…</option>
      <option value="Equipo interno">Equipo interno</option>
      <option value="Familiar / personal">Familiar / personal</option>
      <option value="Proveedor / colaborador">Proveedor / colaborador</option>
      <option value="Otro no comercial">Otro no comercial</option>
    </select>
  );
  return (
    <article
      className={`inbox-row ${selected ? "batch-selected" : ""} ${showActions ? "actions-open" : ""}`}
    >
      <label className="inbox-select" aria-label={`Seleccionar ${name}`}>
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={() => onToggleSelected?.(item.threadKey)}
        />
      </label>
      <button
        type="button"
        className="inbox-message inbox-open"
        aria-label={`Abrir ficha de ${name}`}
        onClick={() => onOpen?.(item.event_id)}
      >
        <span
          className="channel-dot"
          style={{ background: CHANNELS[item.channel]?.color || "#7d8790" }}
        />
        <div>
          <div className="inbox-name">
            <strong>{name}</strong>
            <span
              className={`intent-tag intent-${intent.toLowerCase().replaceAll(/[^a-záéíóúñ]+/g, "-")}`}
            >
              {intent}
            </span>
            {item.channelConflict && (
              <span className="channel-warning">Canal duplicado corregido</span>
            )}
          </div>
          <span>
            {channelNames} · {dateTime} · {item.messageCount || 1}{" "}
            {(item.messageCount || 1) === 1 ? "mensaje" : "mensajes"}
          </span>
          <p>
            {item.text_body || `[${item.message_type || "mensaje sin texto"}]`}
          </p>
        </div>
        <ChevronRight size={18} />
      </button>
      <button
        type="button"
        className="row-actions-toggle"
        onClick={() => setShowActions((value) => !value)}
      >
        {showActions ? "Cerrar" : "Acciones"}
      </button>
      {pending ? (
        <div className="decision-buttons">
          <button
            onClick={() => onDraft(item.event_id)}
            className="recommended"
          >
            Revisar conversación
          </button>
          <button onClick={() => onClassify(item.event_id, "ignore")}>
            No requiere acción
          </button>
          <button onClick={() => onClassify(item.event_id, "memory")}>
            Solo contexto
          </button>
          <button onClick={() => onClassify(item.event_id, "training")}>
            Entrenador
          </button>
          {excludeSelect}
          <button onClick={() => onArchive(item.event_id)}>Archivar</button>
          <button
            className="danger-link"
            onClick={() => onDelete(item.event_id)}
          >
            Eliminar del CRM
          </button>
        </div>
      ) : (
        <div className="processed-actions">
          <span className={`decision-tag ${item.classification_status}`}>
            {labels[item.classification_status] || item.classification_status}
          </span>
          {item.classification_status === "excluded" ? (
            <button onClick={() => onRestoreCommercial?.(item.event_id)}>
              Corregir: es cliente
            </button>
          ) : (
            excludeSelect
          )}
          {archived ? (
            <button onClick={() => onRestore(item.event_id)}>Restaurar</button>
          ) : (
            <button onClick={() => onArchive(item.event_id)}>Archivar</button>
          )}
          <button
            className="danger-link"
            onClick={() => onDelete(item.event_id)}
          >
            Eliminar del CRM
          </button>
        </div>
      )}
    </article>
  );
}

const TECHNICAL_FIELD_LABELS = {
  rendimiento: "Rendimiento",
  compatibilidad: "Compatibilidad",
  aplicación: "Aplicación",
  dosificación: "Dosificación",
  seguridad: "Seguridad",
  precio: "Precio",
  stock: "Stock",
};

export function CopilotSuggestionPanel({ event }) {
  const [copied, setCopied] = useState(false);
  const [liveCatalog, setLiveCatalog] = useState(null);
  const [fileMessage, setFileMessage] = useState("");
  useEffect(() => {
    let active = true;
    // La base técnica real (Supabase) tiene 68 fichas y crece; el índice
    // estático de 31 (technical-library.mjs) queda como respaldo si todavía
    // no hay conexión online o la consulta falla - buildSuggestion() ya sabe
    // usar uno u otro.
    import("./technical-documents-repo.mjs")
      .then(({ fetchTechnicalDocuments }) => fetchTechnicalDocuments())
      .then((docs) => { if (active) setLiveCatalog(docs); })
      .catch(() => { if (active) setLiveCatalog(null); });
    return () => { active = false; };
  }, []);
  const suggestion = useMemo(
    () => buildSuggestion(event, liveCatalog ? { documents: liveCatalog } : {}),
    [event, liveCatalog],
  );
  async function copyForAI() {
    const text = prepareManualQuery({
      family: suggestion.family,
      intent: suggestion.intent,
      temperature: suggestion.temperature,
      missingQuestions: suggestion.missingQuestions,
      recommendedDocs: suggestion.recommendedDocs,
      customerMessage: event.text_body || "",
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }
  async function openDocFile(doc) {
    if (!doc.storagePath) return;
    setFileMessage("Abriendo…");
    try {
      const { getTechnicalDocumentFileUrl } = await import("./technical-documents-repo.mjs");
      const url = await getTechnicalDocumentFileUrl(doc.storagePath);
      if (!url) throw new Error("No se pudo abrir el archivo.");
      window.open(url, "_blank", "noopener,noreferrer");
      setFileMessage("");
    } catch (error) {
      setFileMessage(error.message || "No se pudo abrir el archivo.");
    }
  }
  const citedFields = Object.entries(suggestion.technicalFields).filter(([, value]) => value !== PENDING_LABEL);
  const pendingFields = Object.entries(suggestion.technicalFields).filter(([, value]) => value === PENDING_LABEL);
  return (
    <div className="copilot-suggestion">
      <div className="copilot-suggestion-head">
        <strong>Sugerencia del copiloto</strong>
        <span className="copilot-suggestion-note">
          Reglas determinísticas, sin IA todavía. No inventa rendimiento,
          compatibilidad, precio ni stock.
        </span>
      </div>
      <p>
        Familia detectada: <b>{suggestion.family}</b> · Intención:{" "}
        <b>{suggestion.intent}</b> · Temperatura: <b>{suggestion.temperature}</b>
        {suggestion.isFollowUp && !suggestion.isClosingMessage && (
          <> · <b>Seguimiento</b> (ya hubo mensajes antes)</>
        )}
      </p>
      {suggestion.isClosingMessage ? (
        <p className="copilot-suggestion-pending">
          Parece un cierre o agradecimiento de una conversación anterior — revisá
          el historial antes de responder, no hace falta pedirle datos de nuevo.
        </p>
      ) : (
        <>
          {suggestion.missingQuestions.length > 0 && (
            <div>
              <span className="copilot-suggestion-label">Preguntas que faltan confirmar</span>
              <ul>
                {suggestion.missingQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
          {suggestion.recommendedDocs.length > 0 && (
            <div>
              <span className="copilot-suggestion-label">
                {suggestion.recommendedDocs.some((doc) => doc.verified) ? "Fichas técnicas a consultar" : "Fichas técnicas a consultar (sin validar todavía)"}
              </span>
              <ul>
                {suggestion.recommendedDocs.map((doc) => (
                  <li key={doc.id}>
                    {doc.product} — {docTypeLabel(doc.docType)}
                    {doc.storagePath && (
                      <>
                        {" "}
                        <button type="button" className="technical-document-file-link" onClick={() => openDocFile(doc)}>Ver PDF</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {fileMessage && <p className="copilot-suggestion-pending">{fileMessage}</p>}
            </div>
          )}
          {citedFields.length > 0 && (
            <div className="copilot-suggestion-cited">
              <span className="copilot-suggestion-label">Citado de una ficha vigente y validada</span>
              {citedFields.map(([field, value]) => (
                <p key={field}><b>{TECHNICAL_FIELD_LABELS[field] || field}:</b> {value}</p>
              ))}
            </div>
          )}
          {pendingFields.length > 0 && (
            <p className="copilot-suggestion-pending">
              {pendingFields.map(([field]) => TECHNICAL_FIELD_LABELS[field] || field).join(", ")}: pendiente de
              verificar contra ficha validada.
            </p>
          )}
        </>
      )}
      <button type="button" className="secondary" onClick={copyForAI}>
        {copied ? "Copiado" : "Preparar consulta para IA"}
      </button>
    </div>
  );
}

export function InboxDraftModal({ draft, setDraft, onClose, onConfirm }) {
  useModalEscape(onClose);
  const update = (name, value) =>
    setDraft({ ...draft, form: { ...draft.form, [name]: value } });
  const form = draft.form;
  const triageResult = scoreTriage(form.triage);
  const updateTriage = (name, value) =>
    update("triage", { ...form.triage, [name]: value === "" ? null : Number(value) });
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onConfirm}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Copiloto · vos aportás el criterio</span>
            <h2>¿Quién es y qué hacemos con esta conversación?</h2>
            <p>
              Confirmá lo que el mensaje no puede decirnos. El CRM nunca
              responde al contacto.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar borrador"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="source-message">
          <strong>Conversación detectada</strong>
          <p>
            {draft.event.text_body ||
              `[${draft.event.message_type || "mensaje sin texto"}]`}
          </p>
        </div>
        <CopilotSuggestionPanel event={draft.event} />
        <div className="form-grid">
          <label>
            ¿Qué relación tiene?
            <select
              value={form.relationship}
              onChange={(event) => update("relationship", event.target.value)}
            >
              <option>A confirmar</option>
              <option>Cliente actual</option>
              <option>Prospecto</option>
              <option>Proveedor</option>
              <option>Socio / aliado</option>
              <option>Contacto personal</option>
              <option>No comercial</option>
            </select>
          </label>
          <label>
            ¿Representa una empresa?
            <select
              value={form.representsCompany}
              onChange={(event) =>
                update("representsCompany", event.target.value)
              }
            >
              <option>A confirmar</option>
              <option>Sí</option>
              <option>No</option>
            </select>
          </label>
          <label>
            Empresa / referencia
            <input
              required
              value={form.company}
              onChange={(event) => update("company", event.target.value)}
              placeholder="Nombre o referencia"
            />
          </label>
          <label>
            Persona / contacto
            <input
              value={form.contact}
              onChange={(event) => update("contact", event.target.value)}
            />
          </label>
          <label>
            Intención
            <select
              value={form.intent}
              onChange={(event) => update("intent", event.target.value)}
            >
              {INTENTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Familia
            <select
              value={form.family}
              onChange={(event) => update("family", event.target.value)}
            >
              {FAMILIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="span-2">
            ¿Qué pensás de este contacto?
            <textarea
              value={form.sellerOpinion}
              onChange={(event) => update("sellerOpinion", event.target.value)}
              placeholder="Ej. serio, pregunta mucho pero decide; conoce el producto; necesita seguimiento cercano"
            />
          </label>
          <label className="span-2">
            ¿Qué querés que recuerde para la próxima vez?
            <textarea
              value={form.memoryNote}
              onChange={(event) => update("memoryNote", event.target.value)}
              placeholder="Preferencias, promesas, contexto humano o comercial"
            />
          </label>
          <label>
            Temperatura
            <select
              value={form.temperature}
              onChange={(event) => update("temperature", event.target.value)}
            >
              <option>Frío</option>
              <option>Tibio</option>
              <option>Caliente</option>
            </select>
          </label>
          <label>
            Etapa
            <select
              value={commercialStage(form.stage)}
              onChange={(event) => update("stage", event.target.value)}
            >
              {PIPELINE.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <fieldset className="triage-fieldset span-2">
            <legend>Triage comercial · una sola vez por empresa</legend>
            <div className="triage-summary">
              <strong>{triageResult.score}/12 · {triageResult.complete ? `Prioridad ${triageResult.priority}` : `${triageResult.known}/6 confirmadas`}</strong>
              <span>Los campos sin evidencia quedan sin confirmar; el CRM no completa supuestos.</span>
            </div>
            <div className="triage-grid">
              {TRIAGE_VARIABLES.map((variable) => (
                <label key={variable.id} title={variable.question}>
                  {variable.label}
                  <select value={form.triage?.[variable.id] ?? ""} onChange={(event) => updateTriage(variable.id, event.target.value)}>
                    <option value="">Sin confirmar</option>
                    {variable.options.map((option, index) => <option key={option} value={index}>{index} · {option}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Fecha próxima
            <input
              type="date"
              value={form.nextDate}
              onChange={(event) => update("nextDate", event.target.value)}
            />
          </label>
          <label className="span-2">
            Resumen sugerido
            <textarea
              value={form.summary}
              onChange={(event) => update("summary", event.target.value)}
            />
          </label>
          <label className="span-2">
            Necesidad detectada
            <textarea
              value={form.need}
              onChange={(event) => update("need", event.target.value)}
            />
          </label>
          <label className="span-2">
            Próxima acción
            <input
              value={form.nextAction}
              onChange={(event) => update("nextAction", event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Ahora no
          </button>
          <button className="primary" type="submit">
            {shouldCreateFollowup(form) ? "Guardar memoria y seguimiento" : "Guardar conversación"}
          </button>
        </div>
      </form>
    </div>
  );
}
