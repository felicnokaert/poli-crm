import { memo, useState } from "react";
import { Search } from "lucide-react";
import {
  groupWhatsAppThreads,
} from "./whatsapp-threads.mjs";
import { wasAnsweredOutside } from "./answered-outside.mjs";
import { isLowSignalWhatsAppEvent } from "./whatsapp-events.mjs";
import { FAMILIES } from "./families.mjs";
import { Empty } from "./ui-primitives";
import { InboxRow, LegacyInboxRow } from "./InboxComponents";

function WhatsAppInboxBase({
  items,
  statusEvents,
  clients,
  onClassify,
  onDraft,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onDeleteLegacy,
  onDeleteAllLegacy,
  onExclude,
  onRestoreCommercial,
  onBatchClassify,
  onBatchArchive,
  onBatchExclude,
  onBatchDelete,
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [family, setFamily] = useState("all");
  const [priority, setPriority] = useState("all");
  const [selected, setSelected] = useState([]);
  const threads = groupWhatsAppThreads(
    items.filter((item) => !item.legacyCapture && !isLowSignalWhatsAppEvent(item)),
  ).map((item) => {
    const client =
      clients.find(
        (entry) => entry.whatsappId && entry.whatsappId === item.customer_wa_id,
      ) ||
      clients.find(
        (entry) =>
          item.customer_name &&
          entry.company?.toLowerCase() === item.customer_name.toLowerCase(),
      );
    return {
      ...item,
      commercialFamily: client?.family || "Sin definir",
      commercialPriority: client?.temperature || "A confirmar",
    };
  });
  const legacyThreads = groupWhatsAppThreads(
    items.filter((item) => item.legacyCapture),
  );
  const visible = threads.filter((item) => {
    const matchesChannel =
      channel === "all" || (item.channels || [item.channel]).includes(channel);
    const matchesFamily = family === "all" || item.commercialFamily === family;
    const matchesPriority =
      priority === "all" || item.commercialPriority === priority;
    const haystack =
      `${item.customer_name || ""} ${item.customer_wa_id || ""} ${item.text_body || ""}`.toLowerCase();
    return (
      matchesChannel &&
      matchesFamily &&
      matchesPriority &&
      haystack.includes(query.trim().toLowerCase())
    );
  });
  // Si una captura histórica aparece en ambos canales, no adivinamos cuál es
  // el correcto ni la mezclamos con la operación diaria. Queda aislada para
  // revisión sin alterar los mensajes nuevos cuyo canal sí está probado.
  const channelConflicts = visible.filter((item) => item.channelConflict);
  const operationalVisible = visible.filter((item) => !item.channelConflict);
  const archived = operationalVisible.filter(
    (item) => item.classification_status === "archived",
  );
  const excluded = operationalVisible.filter(
    (item) => item.classification_status === "excluded",
  );
  const active = operationalVisible.filter(
    (item) => !["archived", "excluded"].includes(item.classification_status),
  );
  const allPending = active.filter(
    (item) => item.classification_status === "pending",
  );
  // Los mensajes de más de 7 días sin clasificar no cuentan como pendientes
  // del día a día: se guardan aparte para que "Por revisar" arranque
  // limpio con lo reciente. Nada se borra ni se pierde.
  const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pending = allPending.filter(
    (item) => new Date(item.occurred_at || 0).getTime() >= staleCutoff,
  );
  const stalePending = allPending.filter(
    (item) => new Date(item.occurred_at || 0).getTime() < staleCutoff,
  );
  // Si Felipe ya le contestó al cliente desde el teléfono (no desde el CRM),
  // Meta manda igual una confirmación de status para ese contacto después
  // del mensaje entrante. Esa es la única señal disponible de "ya atendido"
  // sin inventar nada ni tocar la configuración de WhatsApp.
  const answeredOutside = pending.filter((item) =>
    wasAnsweredOutside(item.occurred_at, item.customer_wa_id, statusEvents || []),
  );
  const reallyPending = pending.filter(
    (item) => !answeredOutside.includes(item),
  );
  const selectable = [
    ...reallyPending,
    ...(showAnswered ? answeredOutside : []),
    ...(showStale ? stalePending : []),
    ...(showExcluded ? excluded : []),
    ...(showArchived ? archived : []),
  ];
  const visibleKeys = selectable.map((item) => item.threadKey);
  const selectedVisible = selected.filter((key) => visibleKeys.includes(key));
  const selectedIds = selectable
    .filter((item) => selectedVisible.includes(item.threadKey))
    .map((item) => item.event_id);
  const toggleSelected = (key) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  const selectAllVisible = () =>
    setSelected((current) =>
      visibleKeys.length && visibleKeys.every((key) => current.includes(key))
        ? current.filter((key) => !visibleKeys.includes(key))
        : [...new Set([...current, ...visibleKeys])],
    );
  const finishBatch = (action) => {
    action();
    setSelected([]);
  };
  const rowProps = {
    onClassify,
    onDraft,
    onOpen,
    onArchive,
    onRestore,
    onDelete,
    onExclude,
    onRestoreCommercial,
  };
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Solo entradas nuevas</span>
            <h2>Por revisar</h2>
            <p>
              Cuando decidís qué hacer, desaparece de acá y queda guardada donde
              corresponde.
            </p>
          </div>
          <span className="inbox-count">{reallyPending.length}</span>
        </div>
        <div className="list-toolbar inbox-filters">
          <label className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar contacto o mensaje…"
            />
          </label>
          <select
            value={family}
            onChange={(event) => setFamily(event.target.value)}
          >
            <option value="all">Todas las familias</option>
            {FAMILIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="all">Todas las prioridades</option>
            <option>Caliente</option>
            <option>Tibio</option>
            <option>Frío</option>
            <option>A confirmar</option>
          </select>
        </div>
        <div className="batch-toolbar">
          <label>
            <input
              type="checkbox"
              checked={
                visibleKeys.length > 0 &&
                visibleKeys.every((key) => selected.includes(key))
              }
              onChange={selectAllVisible}
            />{" "}
            Seleccionar visibles
          </label>
          <span>
            {selectedVisible.length
              ? `${selectedVisible.length} seleccionados`
              : "Selección masiva por contacto"}
          </span>
          {selectedVisible.length > 0 && (
            <div className="batch-actions">
              <button
                onClick={() =>
                  finishBatch(() => onBatchClassify(selectedIds, "ignore"))
                }
              >
                No requiere acción
              </button>
              <button
                onClick={() =>
                  finishBatch(() => onBatchClassify(selectedIds, "memory"))
                }
              >
                Solo contexto
              </button>
              <select
                defaultValue=""
                onChange={(event) => {
                  const category = event.target.value;
                  if (category)
                    finishBatch(() => onBatchExclude(selectedIds, category));
                  event.target.value = "";
                }}
              >
                <option value="">Clasificar como…</option>
                <option value="Equipo interno">Equipo interno</option>
                <option value="Familiar / personal">Familiar / personal</option>
                <option value="Proveedor / colaborador">
                  Proveedor / colaborador
                </option>
                <option value="Otro no comercial">Otro no comercial</option>
              </select>
              <button
                onClick={() => finishBatch(() => onBatchArchive(selectedIds))}
              >
                Archivar
              </button>
              <button
                className="danger-link"
                onClick={() => finishBatch(() => onBatchDelete(selectedIds))}
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
        {reallyPending.length ? (
          reallyPending.map((item) => (
            <InboxRow
              item={item}
              {...rowProps}
              selected={selected.includes(item.threadKey)}
              onToggleSelected={toggleSelected}
              key={item.threadKey}
            />
          ))
        ) : (
          <Empty text="No hay conversaciones esperando clasificación con este filtro." />
        )}
      </section>
      {answeredOutside.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Detectado por WhatsApp</span>
              <h2>Ya respondiste</h2>
              <p>
                Le mandaste algo a este contacto desde el teléfono después de
                su último mensaje. Si te equivocaste, podés reabrirlo desde
                acá igual que los demás.
              </p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowAnswered(!showAnswered)}
            >
              {showAnswered ? "Ocultar" : `Mostrar (${answeredOutside.length})`}
            </button>
          </div>
          {showAnswered &&
            answeredOutside.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
      {stalePending.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Más de 7 días sin clasificar</span>
              <h2>Antiguos</h2>
              <p>
                No cuentan como pendientes del día a día. Podés revisarlos y
                clasificarlos igual que los recientes.
              </p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowStale(!showStale)}
            >
              {showStale ? "Ocultar" : `Mostrar (${stalePending.length})`}
            </button>
          </div>
          {showStale &&
            stalePending.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
      {channelConflicts.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Fuera de la bandeja operativa</span>
              <h2>Canal por confirmar</h2>
              <p>
                Son capturas anteriores que aparecieron en General y Penosil.
                No cuentan como pendientes hasta que se confirme su origen.
              </p>
            </div>
            <span className="inbox-count warning">{channelConflicts.length}</span>
          </div>
          <button
            className="danger-link"
            onClick={() => onDeleteAllLegacy(channelConflicts)}
          >
            Limpiar todo ({channelConflicts.length})
          </button>
          {channelConflicts.map((item) => (
            <LegacyInboxRow
              item={item}
              onDelete={onDeleteLegacy}
              key={`conflict-${item.threadKey}`}
            />
          ))}
        </section>
      )}
      {excluded.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Ocultos de la operación diaria</span>
              <h2>Contactos no comerciales</h2>
              <p>
                Sus mensajes futuros se guardan fuera de la bandeja. Podés
                recuperarlos si cambian de rol o fueron clasificados por error.
              </p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowExcluded(!showExcluded)}
            >
              {showExcluded ? "Ocultar" : `Mostrar (${excluded.length})`}
            </button>
          </div>
          {showExcluded &&
            excluded.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
      {legacyThreads.length > 0 && (
        <section className="panel quarantine-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Visible pero aislado</span>
              <h2>Capturas anteriores para revisar</h2>
              <p>
                Pueden contener nombre de grupo o remitente mezclado. No
                alimentan clientes ni oportunidades.
              </p>
            </div>
            <span className="inbox-count warning">{legacyThreads.length}</span>
          </div>
          <button
            className="danger-link"
            onClick={() => onDeleteAllLegacy(legacyThreads)}
          >
            Limpiar todo ({legacyThreads.length})
          </button>
          {legacyThreads.map((item) => (
            <LegacyInboxRow
              item={item}
              onDelete={onDeleteLegacy}
              key={item.threadKey}
            />
          ))}
        </section>
      )}
      {archived.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Fuera de la vista diaria</span>
              <h2>Conversaciones archivadas</h2>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Ocultar" : `Mostrar (${archived.length})`}
            </button>
          </div>
          {showArchived &&
            archived.map((item) => (
              <InboxRow
                item={item}
                {...rowProps}
                selected={selected.includes(item.threadKey)}
                onToggleSelected={toggleSelected}
                key={item.threadKey}
              />
            ))}
        </section>
      )}
    </div>
  );
}

// Memoizado: esta vista agrupa/filtra threads con trabajo no trivial, y
// App() re-renderiza seguido por motivos ajenos (sync, otras pantallas).
export const WhatsAppInbox = memo(WhatsAppInboxBase);
