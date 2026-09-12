import { ChevronRight, X } from "lucide-react";
import { formatDate } from "./utils.mjs";
import { Fact } from "./ui-primitives";
import { CHANNELS, commercialStage, useModalEscape } from "./app-shared";

export function InteractionRow({ item, expanded = false, onOpen, liveTemperature }) {
  // liveTemperature (la temperatura actual de la ficha del cliente, si se
  // conoce en este contexto) pisa la que se guardó al registrar la
  // conversación — el historial no debería quedar con una foto vieja.
  const temperature = liveTemperature || item.temperature || "Tibio";
  const content = (
    <>
      <span
        className="channel-dot"
        style={{ background: CHANNELS[item.channel]?.color || "#7d8790" }}
      />
      <div>
        <strong>{item.company}</strong>
        <span>
          {item.contact ||
            CHANNELS[item.channel]?.name ||
            "Contacto sin identificar"}{" "}
          · {new Date(item.createdAt).toLocaleString("es-AR")}
        </span>
        {expanded && <p>{item.summary || item.need || "Sin resumen"}</p>}
      </div>
      <div className="row-tail">
        <span className={`temp ${temperature.toLowerCase()}`}>
          {temperature}
        </span>
        <ChevronRight size={17} />
      </div>
    </>
  );
  return onOpen ? (
    <button
      className={`interaction-row ${expanded ? "expanded" : ""}`}
      onClick={() => onOpen(item.id)}
    >
      {content}
    </button>
  ) : (
    <div className={`interaction-row ${expanded ? "expanded" : ""}`}>
      {content}
    </div>
  );
}

export function InteractionDetail({
  interaction,
  client,
  onClose,
  onEdit,
  onOpenClient,
  onDelete,
}) {
  useModalEscape(onClose);
  if (!interaction) return null;
  return (
    <div className="modal-backdrop">
      <section className="modal interaction-detail">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Conversación registrada</span>
            <h2>{interaction.company}</h2>
            <p>
              {interaction.contact || "Contacto sin identificar"} ·{" "}
              {formatDate(interaction.createdAt)}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar conversación"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="conversation-detail-grid">
          <Fact label="Canal" value={CHANNELS[interaction.channel]?.name} />
          <Fact label="Familia" value={client?.family || interaction.family} />
          <Fact label="Temperatura" value={client?.temperature || interaction.temperature} />
          <Fact label="Etapa" value={client?.stage ? commercialStage(client.stage) : interaction.stage} />
        </div>
        <div className="detail-block">
          <span>Qué hablaron</span>
          <p>{interaction.summary || "Sin resumen registrado."}</p>
        </div>
        <div className="detail-block">
          <span>Necesidad detectada</span>
          <p>{interaction.need || "Necesidad pendiente de confirmar."}</p>
        </div>
        <div className="detail-block">
          <span>Próxima acción</span>
          <p>
            {interaction.nextAction || "Sin próxima acción definida."}
            {interaction.nextDate
              ? ` · ${formatDate(interaction.nextDate)}`
              : ""}
          </p>
        </div>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => onEdit(interaction)}
          >
            Editar
          </button>
          {client && (
            <button
              className="primary"
              type="button"
              onClick={() => onOpenClient(client.id)}
            >
              Ver ficha del cliente
            </button>
          )}
          <button
            className="danger-link"
            type="button"
            onClick={() => onDelete(interaction.id)}
          >
            Eliminar conversación
          </button>
        </div>
      </section>
    </div>
  );
}
