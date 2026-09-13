import { memo, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatDate } from "./utils.mjs";
import { Empty } from "./ui-primitives";
import { clientContacts } from "./client-contacts.mjs";
import { applyDuplicateReviewDecisions, detectDuplicateClientCandidates } from "./duplicate-candidates.mjs";
import { canonicalFamily } from "./families.mjs";

function ClientsBase({ clients, query, setQuery, onOpenClient, onMergeClients, mergeLogs = [], onUndoMerge, duplicateReviewDecisions = [], onMarkNotDuplicate, onPostponeDuplicate, searchInputRef }) {
  const [family, setFamily] = useState("Todas");
  const [portfolio, setPortfolio] = useState("Todos");
  const [contact, setContact] = useState("Todos");
  const [review, setReview] = useState("Por validar");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const duplicateCandidates = useMemo(
    () => applyDuplicateReviewDecisions(detectDuplicateClientCandidates(clients), duplicateReviewDecisions),
    [clients, duplicateReviewDecisions],
  );
  const duplicateCounts = duplicateCandidates.reduce(
    (counts, candidate) => ({ ...counts, [candidate.confidence]: counts[candidate.confidence] + 1 }),
    { high: 0, medium: 0, low: 0 },
  );
  const families = [
    "Todas",
    ...new Set(clients.map((client) => canonicalFamily(client.family) || "Sin definir")),
  ];
  const visible = clients.filter(
    (client) =>
      (family === "Todas" || (canonicalFamily(client.family) || "Sin definir") === family) &&
      (portfolio === "Todos" ||
        (portfolio === "Activos"
          ? client.pipelineActive !== false
          : client.pipelineActive === false)) &&
      (contact === "Todos" ||
        (contact === "Con contacto"
          ? Boolean(client.phone || client.email || client.contact)
          : !client.phone && !client.email && !client.contact)) &&
      (review === "Todos" ||
        (review === "Por validar" &&
          (!client.sourceType || client.sourceType === "A confirmar")) ||
        (review === "Clientes" &&
          ["Cliente histórico", "Cliente activo"].includes(
            client.sourceType,
          )) ||
        (review === "Prospectos" &&
          [
            "Relevamiento activo",
            "Prospecto de inteligencia comercial",
          ].includes(client.sourceType)) ||
        (review === "Descartados" && client.sourceType === "No corresponde")),
  );
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pages);
  const paged = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [query, family, portfolio, contact, review]);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            Cartera unificada · {visible.length} visibles
          </span>
          <h2>Empresas y prospectos</h2>
          <p>
            Revisá manualmente la cartera; dentro de cada ficha podés editar
            su tipo de registro.
          </p>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Empresa, CUIT, contacto, teléfono…"
            title="Presioná / para buscar"
          />
        </label>
      </div>
      <div className="client-filters">
        <select value={review} onChange={(e) => setReview(e.target.value)}>
          <option>Por validar</option>
          <option>Clientes</option>
          <option>Prospectos</option>
          <option>Descartados</option>
          <option>Todos</option>
        </select>
        <select
          value={portfolio}
          onChange={(e) => setPortfolio(e.target.value)}
        >
          <option>Todos</option>
          <option>Activos</option>
          <option>En cartera</option>
        </select>
        <select value={family} onChange={(e) => setFamily(e.target.value)}>
          {families.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={contact} onChange={(e) => setContact(e.target.value)}>
          <option>Todos</option>
          <option>Con contacto</option>
          <option>Falta contacto</option>
        </select>
        <button
          type="button"
          className={`duplicate-toggle ${showDuplicates ? "selected" : ""}`}
          onClick={() => setShowDuplicates(!showDuplicates)}
        >
          Posibles duplicados · {duplicateCandidates.length}
        </button>
      </div>
      {showDuplicates && (
        <div className="duplicate-review">
          <div className="duplicate-summary">
            <div><strong>{duplicateCounts.high}</strong><span>Confianza alta</span></div>
            <div><strong>{duplicateCounts.medium}</strong><span>Confianza media</span></div>
            <div><strong>{duplicateCounts.low}</strong><span>Revisar nombre</span></div>
          </div>
          <p className="duplicate-note">
            Son sugerencias de revisión. El CRM no fusiona ni modifica ninguna ficha automáticamente.
          </p>
          <div className="duplicate-list">
            {duplicateCandidates.map((candidate) => {
              const [left, right] = candidate.clientIds.map((id) => clients.find((client) => client.id === id));
              if (!left || !right) return null;
              return (
                <article className="duplicate-card" key={candidate.id}>
                  <span className={`duplicate-confidence ${candidate.confidence}`}>
                    {candidate.confidence === "high" ? "Alta" : candidate.confidence === "medium" ? "Media" : "Baja"}
                  </span>
                  <div className="duplicate-pair">
                    <button type="button" onClick={() => onOpenClient(left.id)}>
                      <strong>{left.company}</strong>
                      <span>{left.contact || left.phone || left.email || "Sin contacto"} · {left.temperature || "Sin temperatura"}</span>
                    </button>
                    <span>posible coincidencia</span>
                    <button type="button" onClick={() => onOpenClient(right.id)}>
                      <strong>{right.company}</strong>
                      <span>{right.contact || right.phone || right.email || "Sin contacto"} · {right.temperature || "Sin temperatura"}</span>
                    </button>
                  </div>
                  <div className="duplicate-signals">
                    {candidate.signals.map((signal) => <span key={signal.type}>{signal.label}</span>)}
                  </div>
                  <div className="duplicate-actions">
                    <button type="button" onClick={() => onMergeClients(left.id, right.id)}>
                      Fusionar, quedarse con "{left.company}"
                    </button>
                    <button type="button" onClick={() => onMergeClients(right.id, left.id)}>
                      Fusionar, quedarse con "{right.company}"
                    </button>
                    <button
                      type="button"
                      className="duplicate-action-secondary"
                      onClick={() => onMarkNotDuplicate?.(candidate)}
                    >
                      No son duplicados
                    </button>
                    <button
                      type="button"
                      className="duplicate-action-secondary"
                      onClick={() => onPostponeDuplicate?.(candidate)}
                    >
                      Postergar
                    </button>
                  </div>
                </article>
              );
            })}
            {!duplicateCandidates.length && <Empty text="No se detectaron posibles duplicados." />}
          </div>
          {mergeLogs.filter((log) => !log.deshecho).length > 0 && (
            <div className="merge-log-list">
              <p className="duplicate-note">Fusiones recientes · se pueden deshacer</p>
              {mergeLogs
                .filter((log) => !log.deshecho)
                .slice(-8)
                .reverse()
                .map((log) => {
                  const survivor = clients.find((client) => client.id === log.clienteSobrevivienteId);
                  const mergedName = log.snapshotAntes?.merged?.company || "ficha eliminada";
                  return (
                    <div className="merge-log-row" key={log.id}>
                      <span>
                        "{mergedName}" se fusionó dentro de "{survivor?.company || log.snapshotAntes?.survivor?.company || "ficha"}"
                        {log.fecha ? ` · ${formatDate(log.fecha)}` : ""}
                      </span>
                      <button type="button" onClick={() => onUndoMerge(log.id)}>
                        Deshacer
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
      {paged.length ? (
        <>
          <div className="client-table">
            {paged.map((client) => (
              <button
                className="client-row"
                onClick={() => onOpenClient(client.id)}
                key={client.id}
              >
                <div className="avatar">
                  {client.company.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{client.company}</strong>
                  <span>
                    {client.contact ||
                      client.phone ||
                      client.email ||
                      "Datos de contacto pendientes"}
                  </span>
                </div>
                <span>{client.family}</span>
                <span
                  className={`temp ${(client.temperature || "Tibio").toLowerCase()}`}
                >
                  {client.temperature || "Tibio"}
                </span>
                <strong>{client.sourceType || "A confirmar"}</strong>
              </button>
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {safePage} de {pages}
            </span>
            <button
              disabled={safePage === pages}
              onClick={() => setPage(safePage + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      ) : (
        <Empty
          text={
            clients.length
              ? "No hay empresas que coincidan con estos filtros."
              : "Todavía no cargaste ninguna empresa. Probá importar un CSV desde Datos → Importar clientes CSV."
          }
        />
      )}
    </section>
  );
}

// Memoizado: App() re-renderiza seguido por motivos ajenos a esta vista
// (sync, otras pantallas), y detectar duplicados/candidatos es trabajo real.
export const Clients = memo(ClientsBase);

export function Contacts({ clients, query, setQuery, onOpenClient, searchInputRef }) {
  const rows = clients.flatMap((client) =>
    clientContacts(client).map((contact) => ({
      ...contact,
      clientId: client.id,
      company: client.company,
      family: client.family || "Sin definir",
    })),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("es-AR");
  const visible = rows.filter(
    (item) =>
      !normalizedQuery ||
      `${item.company} ${item.name} ${item.role} ${item.phone} ${item.email} ${item.family}`
        .toLocaleLowerCase("es-AR")
        .includes(normalizedQuery),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            Directorio unificado · {visible.length} contactos
          </span>
          <h2>Personas y números</h2>
          <p>
            Una empresa puede tener varios contactos. Cada WhatsApp se vincula a
            su empresa sin duplicarla.
          </p>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Persona, empresa, teléfono o email…"
            title="Presioná / para buscar"
          />
        </label>
      </div>
      {visible.length ? (
        <div className="client-table">
          {visible.map((item) => (
            <button
              className="client-row"
              onClick={() => onOpenClient(item.clientId)}
              key={`${item.clientId}-${item.id}`}
            >
              <div className="avatar">
                {(item.name || item.company).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <strong>{item.name || "Contacto sin nombre"}</strong>
                <span>
                  {item.phone || item.email || "Datos pendientes"}
                  {item.role ? ` · ${item.role}` : ""}
                </span>
              </div>
              <span>{item.company}</span>
              <span>{item.family}</span>
              <strong>{item.primary ? "Principal" : "Adicional"}</strong>
            </button>
          ))}
        </div>
      ) : (
        <Empty text="Todavía no hay contactos que coincidan con la búsqueda." />
      )}
    </section>
  );
}
