import { useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { filterInteractionsByDate, groupConversationHistory } from "./conversation-history.mjs";
import { FAMILIES } from "./families.mjs";
import { Empty } from "./ui-primitives";
import { CHANNELS } from "./app-shared";

const CONVERSATIONS_PAGE_SIZE = 20;

export function Conversations({ items, clients, onOpen, onOpenClient }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("all");
  const [temperature, setTemperature] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [visibleCount, setVisibleCount] = useState(CONVERSATIONS_PAGE_SIZE);
  // Volver a la primera página cada vez que cambia un filtro - si no, con un
  // filtro nuevo podés quedar mostrando "20 de 3" sin ver nada.
  useEffect(() => {
    setVisibleCount(CONVERSATIONS_PAGE_SIZE);
  }, [query, family, temperature, fromDate, toDate]);
  const conversations = groupConversationHistory(filterInteractionsByDate(items, fromDate, toDate));
  const clientIds = new Set(clients.map((client) => client.id));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const filtered = conversations.filter((item) => {
    const matchesQuery = `${item.company || ""} ${item.contact || ""} ${item.summary || ""} ${item.need || ""} ${item.family || ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const validClientIds = (item.clientIds || [item.clientId]).filter((id) => clientIds.has(id));
    const liveFamily = validClientIds.length === 1 ? clientsById.get(validClientIds[0])?.family : null;
    const matchesFamily = family === "all" || (liveFamily || item.family) === family;
    const liveTemperature = validClientIds.length === 1
      ? clientsById.get(validClientIds[0])?.temperature
      : null;
    const matchesTemperature = temperature === "all" || (liveTemperature || item.temperature || "Tibio") === temperature;
    return matchesQuery && matchesFamily && matchesTemperature;
  });
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Una conversación por cliente</span>
          <h2>Historial comercial</h2>
          <p>
            Acá aparecen conversaciones ya registradas. La Bandeja contiene lo
            nuevo que todavía requiere revisión.
          </p>
        </div>
      </div>
      <div className="list-toolbar inbox-filters">
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente o conversación…"
          />
        </label>
        <select value={family} onChange={(event) => setFamily(event.target.value)}>
          <option value="all">Todas las familias</option>
          {FAMILIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={temperature} onChange={(event) => setTemperature(event.target.value)}>
          <option value="all">Todas las temperaturas</option>
          <option>Caliente</option>
          <option>Tibio</option>
          <option>Frío</option>
        </select>
        <label className="date-filter">Desde<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="date-filter">Hasta<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      {filtered.length ? (
        <div className="conversation-list">
          {filtered.slice(0, visibleCount).map((item) => {
            const validClientIds = (item.clientIds || [item.clientId]).filter((id) => clientIds.has(id));
            const hasClient = validClientIds.length === 1;
            // La temperatura mostrada acá es la actual de la ficha del
            // cliente, no la que se guardó al registrar la conversación —
            // si el cliente se recalifica, el historial tiene que reflejarlo,
            // no quedar con una foto vieja.
            const liveTemperature = hasClient
              ? clientsById.get(validClientIds[0])?.temperature
              : null;
            return (
              <button
                className="conversation-thread"
                key={item.conversationKey}
                onClick={() =>
                  hasClient ? onOpenClient(validClientIds[0]) : onOpen(item.id)
                }
              >
                <span
                  className="channel-dot"
                  style={{
                    background: CHANNELS[item.channel]?.color || "#7d8790",
                  }}
                />
                <div>
                  <strong>
                    {item.company || item.contact || "Contacto sin identificar"}
                  </strong>
                  <span>
                    {item.contact ||
                      CHANNELS[item.channel]?.name ||
                      "Sin contacto identificado"}{" "}
                    · {item.messageCount}{" "}
                    {item.messageCount === 1 ? "registro" : "registros"}
                    {item.clientId && !hasClient
                      ? " · ficha pendiente de revincular"
                      : ""}
                  </span>
                  <p>{item.summary || item.need || "Sin resumen registrado"}</p>
                </div>
                <div className="conversation-tail">
                  <time>
                    {new Date(item.latestContactAt).toLocaleDateString("es-AR")} · {new Date(item.latestContactAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} hs
                  </time>
                  <span
                    className={`temp ${(liveTemperature || item.temperature || "Tibio").toLowerCase()}`}
                  >
                    {liveTemperature || item.temperature || "Tibio"}
                  </span>
                  <ChevronRight size={17} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          text={
            items.length
              ? "No hay clientes que coincidan con la búsqueda."
              : "Registrá la primera conversación para comenzar la memoria comercial."
          }
        />
      )}
      {filtered.length > visibleCount && (
        <div className="conversation-list-more">
          <button
            type="button"
            className="secondary"
            onClick={() => setVisibleCount((count) => count + CONVERSATIONS_PAGE_SIZE)}
          >
            Mostrar más ({filtered.length - visibleCount} restantes)
          </button>
        </div>
      )}
    </section>
  );
}
