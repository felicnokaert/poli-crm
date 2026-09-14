import { memo, useEffect, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  Flame,
  ListChecks,
  MessageCircle,
  Plus,
  RefreshCw,
  Snowflake,
  UserX,
  X,
} from "lucide-react";
import { buildRepurchaseRadar } from "./repurchase-radar.mjs";
import { findColdQuotes } from "./cold-quotes.mjs";
import { findStaleHotLeads } from "./hot-leads-radar.mjs";
import { findStaleClients } from "./stale-clients-radar.mjs";
import { findExpiredQuotes } from "./quoted-clients-radar.mjs";
import {
  AUTO_HOT_LEAD_TASK_SOURCE,
  AUTO_COLD_QUOTE_TASK_SOURCE,
  AUTO_STALE_CLIENT_TASK_SOURCE,
  AUTO_EXPIRED_QUOTE_TASK_SOURCE,
} from "./daily-maintenance.mjs";
import { Empty } from "./ui-primitives";
import { today } from "./app-shared";
import { TaskList } from "./Tasks";
import { InteractionRow } from "./Interactions";

const AUTO_TASK_SOURCES = new Set([
  AUTO_HOT_LEAD_TASK_SOURCE,
  AUTO_COLD_QUOTE_TASK_SOURCE,
  AUTO_STALE_CLIENT_TASK_SOURCE,
  AUTO_EXPIRED_QUOTE_TASK_SOURCE,
]);

// Horas de margen antes de marcar el cron como "no corrió" - corre 1 vez
// por día a las 6am (vercel.json), así que 36h da margen para el atraso de
// hasta 1 hora que el plan Hobby permite en la hora del cron, sin marcar
// falsa alarma el mismo día por unas horas de diferencia.
const CRON_STALE_HOURS = 36;

// Indicador de salud del cron - nace directo del incidente real del
// 14/09/2026: `CRON_SECRET` faltaba en Vercel, así que el mantenimiento
// diario (esta misma señal, `dailySignals`) llevaba SEMANAS sin correr ni
// una sola vez sin que nadie lo notara, porque "El sistema no generó tareas
// automáticas hoy" (el mensaje de abajo) se ve idéntico tanto si el cron
// corrió y no encontró nada, como si el cron nunca corrió. `dailySignals`
// solo lo escribe el cron server-side (nunca el cliente - ver el comentario
// en DashboardBase sobre `signalsAreFresh`), así que su `calculatedAt` es
// la única fuente confiable de "¿corrió de verdad, o no?".
function cronHealth(dailySignals) {
  if (!dailySignals?.calculatedAt) return { ok: false, hoursSince: null };
  const hoursSince = (Date.now() - new Date(dailySignals.calculatedAt).getTime()) / 3_600_000;
  return { ok: hoursSince <= CRON_STALE_HOURS, hoursSince };
}

// Indicador chico de auditabilidad (ver AUDITORIA_MADUREZ_PRODUCTO_2026-09-14-tarde):
// hasta ahora las tareas que crea el cron (buildAutoFollowupTasks) quedaban
// mezcladas en la lista de tareas sin ninguna marca visible de que las armó
// el sistema y no una persona. Cuenta cuántas tareas auto-generadas se
// crearon HOY (por `createdAt`, no por `dueDate`, que puede quedar viejo si
// una tarea sigue abierta) para que Felipe pueda notar de un vistazo si el
// cron corrió y qué tan activo estuvo, sin tener que abrir cada tarea.
function AutomationSummary({ tasks, dailySignals }) {
  const { ok: cronOk, hoursSince } = cronHealth(dailySignals);
  if (!cronOk) {
    const sinceText = hoursSince === null
      ? "todavía no corrió nunca en este workspace"
      : `no corrió en las últimas ${Math.round(hoursSince / 24)} día(s)`;
    return (
      <div className="automation-note is-warning">
        <CircleAlert size={15} />
        <span>
          ⚠️ El mantenimiento diario {sinceText} - revisar Vercel → Cron Jobs
          y la variable <code>CRON_SECRET</code>.
        </span>
      </div>
    );
  }

  const now = today();
  const createdToday = tasks.filter(
    (task) => AUTO_TASK_SOURCES.has(task.source) && String(task.createdAt || "").slice(0, 10) === now,
  );
  if (!createdToday.length) {
    return (
      <div className="automation-note is-quiet">
        <ListChecks size={15} />
        <span>El sistema corrió el mantenimiento diario y no generó tareas automáticas hoy.</span>
      </div>
    );
  }
  const hotCount = createdToday.filter((task) => task.source === AUTO_HOT_LEAD_TASK_SOURCE).length;
  const coldCount = createdToday.filter((task) => task.source === AUTO_COLD_QUOTE_TASK_SOURCE).length;
  const staleCount = createdToday.filter((task) => task.source === AUTO_STALE_CLIENT_TASK_SOURCE).length;
  const expiredCount = createdToday.filter((task) => task.source === AUTO_EXPIRED_QUOTE_TASK_SOURCE).length;
  const parts = [];
  if (hotCount) parts.push(`${hotCount} de leads calientes`);
  if (coldCount) parts.push(`${coldCount} de cotizaciones frías`);
  if (staleCount) parts.push(`${staleCount} de clientes sin contacto`);
  if (expiredCount) parts.push(`${expiredCount} de cotizaciones vencidas`);
  return (
    <div className="automation-note">
      <ListChecks size={15} />
      <span>
        El sistema generó {createdToday.length} {createdToday.length === 1 ? "tarea automática" : "tareas automáticas"} hoy
        {parts.length ? ` (${parts.join(", ")})` : ""}.
      </span>
    </div>
  );
}

export function ProjectBoardGateway() {
  return (
    <div className="content-stack">
      <section className="panel academy-hero">
        <div>
          <span className="eyebrow">Organización del trabajo</span>
          <h2>Tablero maestro en Trello</h2>
          <p>
            Trello es la única fuente para proyectos, prioridades, responsables y fechas. El CRM conserva clientes,
            conversaciones, tareas comerciales y ventas. Así evitamos dos tableros que se contradigan.
          </p>
        </div>
        <a
          className="primary"
          href="https://trello.com/b/uSYz1qMF/ventas-grupo-poliplast"
          target="_blank"
          rel="noreferrer"
        >
          Abrir VENTAS — Grupo Poliplast <ExternalLink size={16} />
        </a>
      </section>

      <section className="panel commercial-knowledge">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Guía única</span>
            <h2>Cómo usar el tablero</h2>
          </div>
        </div>
        <div className="knowledge-grid stages">
          <article><span>1</span><h3>00 — Norte y métricas</h3><p>Entrá acá para recordar objetivos, reglas y estado general.</p></article>
          <article><span>2</span><h3>Prioridad semanal</h3><p>Solo lo verdaderamente importante durante esta semana.</p></article>
          <article><span>3</span><h3>En ejecución</h3><p>Trabajo que alguien está realizando ahora, con responsable claro.</p></article>
          <article><span>4</span><h3>Esperando / Bloqueado</h3><p>Separá lo que depende de terceros de lo que tiene un impedimento real.</p></article>
          <article><span>5</span><h3>Revisión / Terminado</h3><p>Primero se valida el resultado; después se cierra la tarjeta.</p></article>
          <article><span>6</span><h3>Backlog</h3><p>Ideas y trabajos futuros que no deben competir con la semana actual.</p></article>
        </div>
        <p className="quality-note">
          <strong>Regla:</strong> una empresa o conversación nunca se convierte en tarjeta de Trello. Se registra en
          Empresas, Por revisar, Historial o Tareas dentro del CRM.
        </p>
      </section>
    </div>
  );
}

const DAY_PLAN_PREFIX = "poliplast-day-plan-";

function useDayPlan() {
  const key = DAY_PLAN_PREFIX + today();
  const [plan, setPlan] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(plan));
    } catch {
      // localStorage puede fallar en modo privado; el plan simplemente no persiste.
    }
  }, [plan, key]);
  return [plan, setPlan];
}

// El plan de hoy no se autocompleta: a primera hora se sugieren los
// pendientes reales (tareas vencidas, cotizaciones frías, recompra, RRSS) y
// el usuario decide cuáles suma como "esto lo hago hoy", más lo que quiera
// escribir a mano. De ahí en más solo tilda lo que va resolviendo.
// Tareas fijas sugeridas cada día, distintas según el canal de la cuenta -
// lo que Felipe hace en General no es lo que hace quien opera Penosil.
const PINNED_TASKS_BY_CHANNEL = {
  general: [
    { id: "rrss", label: "Mensajes RRSS — leer y contestar todas las cuentas del grupo" },
  ],
  penosil: [
    { id: "penosil-catalogo", label: "Subir productos al catálogo" },
    { id: "penosil-whatsapp", label: "Contestar todos los WhatsApp" },
    { id: "penosil-prospectar", label: "Prospectar y buscar (público objetivo de Penosil)" },
    { id: "penosil-estado", label: "Subir estado" },
    { id: "penosil-contenido", label: "Subir contenido al canal" },
  ],
};

// Un ítem del plan de hoy puede señalar una tarea o un mensaje de WhatsApp
// concreto (id con prefijo "task:"/"hot:"/"cold:"). Cuando ese es el caso,
// devolvemos la acción que abre esa ficha directamente - así ver la
// urgencia y actuar sobre ella no obliga a navegar a otra pantalla primero.
function openTargetForId(id, { onOpenTask, onOpenEvent, onNavigate }) {
  if (id.startsWith("task:")) return () => onOpenTask?.(id.slice("task:".length));
  if (id.startsWith("hot:") || id.startsWith("cold:")) {
    return () => onOpenEvent?.(id.slice(id.indexOf(":") + 1));
  }
  if (id === "overdue:summary") return () => onNavigate?.("tasks");
  return null;
}

export function DayMode({
  overdueTasks,
  dueTodayTasks,
  hotLeads,
  coldQuotes,
  repurchaseRadar,
  staleClients,
  expiredQuotes,
  myChannels,
  onNavigate,
  onOpenTask,
  onOpenEvent,
}) {
  const [plan, setPlan] = useDayPlan();
  const [customText, setCustomText] = useState("");
  const planIds = new Set(plan.map((item) => item.id));
  const openHandlers = { onOpenTask, onOpenEvent, onNavigate };

  function addToPlan(id, label) {
    if (planIds.has(id)) return;
    setPlan((current) => [...current, { id, label, done: false }]);
  }
  function toggleDone(id) {
    setPlan((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }
  function removeFromPlan(id) {
    setPlan((current) => current.filter((item) => item.id !== id));
  }
  function addCustom(event) {
    event.preventDefault();
    if (!customText.trim()) return;
    setPlan((current) => [...current, { id: `custom:${crypto.randomUUID()}`, label: customText.trim(), done: false }]);
    setCustomText("");
  }

  const candidates = [
    ...hotLeads.map((item) => ({ id: `hot:${item.eventId}`, label: `🔥 Responder — ${item.customer} lleva ${item.daysSince}d sin respuesta` })),
    ...dueTodayTasks.map((task) => ({
      id: `task:${task.id}`,
      label: `${task.title}${task.company ? ` — ${task.company}` : ""}`,
    })),
    ...(overdueTasks.length
      ? [
          {
            id: "overdue:summary",
            label: `Revisar ${overdueTasks.length} ${overdueTasks.length === 1 ? "seguimiento vencido" : "seguimientos vencidos"} en Tareas`,
          },
        ]
      : []),
    ...coldQuotes.map((item) => ({ id: `cold:${item.eventId}`, label: `Retomar cotización fría — ${item.customer}` })),
    ...staleClients.map((item) => ({ id: `stale:${item.clientId}`, label: `Retomar contacto — ${item.company} (${item.daysSince}d sin actividad)` })),
    ...expiredQuotes.map((item) => ({ id: `expired:${item.clientId}`, label: `Seguimiento de cotización — ${item.company} (${item.daysSince}d sin cerrar)` })),
    ...repurchaseRadar.map((item) => ({ id: `repurchase:${item.customer}-${item.product}`, label: `Ofrecer recompra — ${item.customer} (${item.product})` })),
    ...(myChannels || []).flatMap((channel) => PINNED_TASKS_BY_CHANNEL[channel] || []),
  ].filter((item) => !planIds.has(item.id)).slice(0, 10);

  const doneCount = plan.filter((item) => item.done).length;

  return (
    <section className="panel day-mode">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Primera hora</span>
          <h2>Plan de hoy</h2>
          <p>¿Qué pensás hacer hoy? Sumá lo que te sirva de lo pendiente y marcá lo que vayas resolviendo.</p>
        </div>
        <ListChecks size={22} />
      </div>
      {plan.length > 0 && (
        <div className="day-mode-list">
          {plan.map((item) => {
            const openTarget = openTargetForId(item.id, openHandlers);
            return (
              <div className={`day-mode-item${item.done ? " is-done" : ""}`} key={item.id}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleDone(item.id)}
                  aria-label={item.done ? `Marcar "${item.label}" como pendiente` : `Marcar "${item.label}" como hecha`}
                />
                {openTarget ? (
                  <button type="button" className="day-mode-item-label" onClick={openTarget}>
                    {item.label}
                  </button>
                ) : (
                  <span className="day-mode-item-label">{item.label}</span>
                )}
                <button type="button" className="icon-button" onClick={() => removeFromPlan(item.id)} aria-label="Quitar del plan">
                  <X size={13} />
                </button>
              </div>
            );
          })}
          <small className="day-mode-progress">{doneCount} de {plan.length} hechas</small>
        </div>
      )}
      {candidates.length > 0 && (
        <div className="day-mode-candidates">
          <span className="day-mode-subhead">Pendiente — ¿lo hacés hoy?</span>
          {candidates.map((item) => {
            const openTarget = openTargetForId(item.id, openHandlers);
            return (
              <div className="day-mode-candidate" key={item.id}>
                {openTarget ? (
                  <button type="button" className="day-mode-candidate-label" onClick={openTarget}>
                    {item.label}
                  </button>
                ) : (
                  <span className="day-mode-candidate-label">{item.label}</span>
                )}
                <button
                  type="button"
                  className="icon-button day-mode-candidate-add"
                  onClick={() => addToPlan(item.id, item.label)}
                  aria-label={`Sumar "${item.label}" al plan de hoy`}
                >
                  <Plus size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <form className="day-mode-add" onSubmit={addCustom}>
        <input
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          placeholder="¿Algo pendiente que quieras agregar?"
        />
        <button type="submit" className="secondary">
          <Plus size={15} /> Agregar
        </button>
      </form>
      {overdueTasks.length > 0 && (
        <button type="button" className="link-button day-mode-link" onClick={() => onNavigate("tasks")}>
          Ver todas las tareas vencidas en Tareas
        </button>
      )}
      {hotLeads.length > 0 && (
        <button type="button" className="link-button day-mode-link" onClick={() => onNavigate("inbox")}>
          Ver los mensajes calientes sin responder en Por revisar
        </button>
      )}
    </section>
  );
}

function DashboardBase({
  metrics,
  tasks,
  interactions,
  clients,
  sales,
  inbox,
  myChannels,
  dailySignals,
  onToggle,
  onOpenTask,
  onOpenInteraction,
  onOpenEvent,
  onNavigate,
}) {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const now = today();
  // Si el cron server-side ya calculó las señales de hoy (dailySignals en el
  // estado del workspace, ver src/daily-maintenance.mjs), las usamos en vez
  // de recalcular todo client-side - esto confirma que lo persistido se usa
  // de verdad y evita repetir el trabajo en el navegador. Si no existe o es
  // de un día anterior (nadie corrió el cron todavía, o es una fila vieja),
  // hacemos fallback al cálculo client-side de siempre para no romper nada.
  const signalsAreFresh = dailySignals && String(dailySignals.calculatedAt || "").slice(0, 10) === now;
  const repurchaseRadar = (signalsAreFresh ? dailySignals.repurchase : buildRepurchaseRadar(sales)).slice(0, 6);
  const coldQuotes = (signalsAreFresh ? dailySignals.coldQuotes : findColdQuotes(inbox, sales)).slice(0, 6);
  const hotLeads = (signalsAreFresh ? dailySignals.hotLeads : findStaleHotLeads(inbox)).slice(0, 6);
  const staleClients = (signalsAreFresh ? dailySignals.staleClients : findStaleClients(clients, sales, inbox)).slice(0, 6);
  const expiredQuotes = (signalsAreFresh ? dailySignals.expiredQuotes : findExpiredQuotes(clients, sales)).slice(0, 6);
  const overdueTasks = tasks.filter((task) => !task.done && task.dueDate && task.dueDate < now);
  const dueTodayTasks = tasks.filter((task) => !task.done && task.dueDate === now);
  const latestByContact = [];
  const seenContacts = new Set();
  for (const interaction of interactions) {
    const contactKey = String(
      interaction.contact ||
        interaction.clientId ||
        interaction.company ||
        interaction.id,
    )
      .trim()
      .toLocaleLowerCase("es-AR");
    if (seenContacts.has(contactKey)) continue;
    seenContacts.add(contactKey);
    latestByContact.push(interaction);
  }
  const cards = [
    ["Contactos esta semana", metrics.contacts, "Meta: 15", MessageCircle],
    ["Contactos efectivos", metrics.effective, "Meta: 8–10", CheckCircle2],
    ["Propuestas activas", metrics.proposals, "Meta: 2–3", BarChart3],
    [
      "Seguimientos vencidos",
      metrics.overdue,
      metrics.overdue
        ? "Necesitan acción hoy"
        : metrics.dueToday
          ? `${metrics.dueToday} vencen hoy`
          : "Ninguno pendiente",
      CircleAlert,
    ],
    [
      "Calientes sin responder",
      hotLeads.length,
      hotLeads.length ? "Mensajes urgentes en la bandeja" : "Ninguno por ahora",
      Flame,
    ],
  ];
  return (
    <div className="content-stack">
      <DayMode
        overdueTasks={overdueTasks}
        dueTodayTasks={dueTodayTasks}
        hotLeads={hotLeads}
        coldQuotes={coldQuotes}
        repurchaseRadar={repurchaseRadar}
        staleClients={staleClients}
        expiredQuotes={expiredQuotes}
        myChannels={myChannels}
        onNavigate={onNavigate}
        onOpenTask={onOpenTask}
        onOpenEvent={onOpenEvent}
      />
      <section className="metric-grid">
        {cards.map(([label, value, note, Icon]) => (
          <article className="metric-card" key={label}>
            <Icon size={20} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <AutomationSummary tasks={tasks} dailySignals={dailySignals} />
      <section className="two-columns">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Prioridad</span>
              <h2>Próximas acciones</h2>
            </div>
            <CalendarCheck size={22} />
          </div>
          <TaskList
            items={tasks
              .filter((task) => !task.done)
              .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
              .slice(0, 6)}
            onToggle={onToggle}
            onOpen={onOpenTask}
            emptyText="Sin tareas por ahora. Registrá una conversación para que el copiloto te ayude a definir el próximo paso."
          />
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Actividad</span>
              <h2>Últimas conversaciones</h2>
            </div>
            <MessageCircle size={22} />
          </div>
          {latestByContact.length ? (
            latestByContact
              .slice(0, 5)
              .map((item) => (
                <InteractionRow
                  item={item}
                  key={item.id}
                  onOpen={onOpenInteraction}
                  liveTemperature={clientsById.get(item.clientId)?.temperature}
                />
              ))
          ) : (
            <Empty text="Todavía no hay conversaciones registradas. La primera que cargues inicia la memoria comercial." />
          )}
        </article>
      </section>
      <section className="two-columns">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Se calcula solo, sin IA</span>
              <h2>Para reponer</h2>
            </div>
            <RefreshCw size={22} />
          </div>
          {repurchaseRadar.length ? (
            repurchaseRadar.map((item) => (
              <article className="radar-row" key={`${item.customer}-${item.product}`}>
                <div>
                  <strong>{item.customer}</strong>
                  <span>{item.product}</span>
                </div>
                <div>
                  <span className="radar-badge overdue">+{item.overdueDays}d</span>
                  <small>
                    cada {item.avgIntervalDays}d, último hace {item.daysSinceLast}d
                    {item.avgQuantity ? ` · ~${item.avgQuantity} por compra` : ""}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <Empty text="Todavía no hay suficientes ventas repetidas por cliente y producto para estimar ciclos de reposición." />
          )}
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Cotizaron y no volvieron</span>
              <h2>Cotizaciones frías</h2>
            </div>
            <Snowflake size={22} />
          </div>
          {coldQuotes.length ? (
            coldQuotes.map((item) => (
              <article className="radar-row" key={item.eventId}>
                <div>
                  <strong>{item.customer}</strong>
                  <span>{item.text}</span>
                </div>
                <div>
                  <span className="radar-badge cold">{item.daysSince}d</span>
                </div>
              </article>
            ))
          ) : (
            <Empty text="No hay cotizaciones sin seguimiento por ahora." />
          )}
        </article>
      </section>
      {staleClients.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Activos, pero se enfrían</span>
              <h2>Clientes sin contacto</h2>
              <p>Cuentas con resultado abierto sin ninguna venta ni mensaje de WhatsApp en 30 días o más.</p>
            </div>
            <UserX size={22} />
          </div>
          {staleClients.map((item) => (
            <button
              type="button"
              className="radar-row radar-row-clickable"
              key={item.clientId}
              onClick={() => onNavigate("clients")}
            >
              <div>
                <strong>{item.company}</strong>
              </div>
              <div>
                <span className="radar-badge cold">{item.daysSince}d</span>
              </div>
            </button>
          ))}
        </section>
      )}
      {expiredQuotes.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Marcadas con "Coticé hoy", sin cerrar</span>
              <h2>Cotizaciones vencidas</h2>
              <p>Cuentas donde marcaste que enviaste una cotización y pasaron 15 días o más sin registrar una venta.</p>
            </div>
            <Clock3 size={22} />
          </div>
          {expiredQuotes.map((item) => (
            <button
              type="button"
              className="radar-row radar-row-clickable"
              key={item.clientId}
              onClick={() => onNavigate("clients")}
            >
              <div>
                <strong>{item.company}</strong>
              </div>
              <div>
                <span className="radar-badge cold">{item.daysSince}d</span>
              </div>
            </button>
          ))}
        </section>
      )}
      {hotLeads.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Urgente + comercial, sin clasificar</span>
              <h2>Calientes sin responder</h2>
              <p>Mensajes en "Por revisar" que suenan urgentes (hoy, mañana, para el viernes) y comerciales (precio, cantidad, stock), pero llevan más de 2 días sin que nadie los toque.</p>
            </div>
            <Flame size={22} />
          </div>
          {hotLeads.map((item) => (
            <button
              type="button"
              className="radar-row radar-row-clickable"
              key={item.eventId}
              onClick={() => onNavigate("inbox")}
            >
              <div>
                <strong>{item.customer}</strong>
                <span>{item.text}</span>
              </div>
              <div>
                <span className="radar-badge hot">{item.daysSince}d</span>
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

// Memoizado: App() re-renderiza seguido por motivos ajenos al dashboard
// (sync status, edición de otras vistas, etc.) y este componente hace un
// trabajo de armado de radares/listas nada gratis, así que conviene evitar
// re-renderizarlo cuando ninguna de sus props cambió realmente.
export const Dashboard = memo(DashboardBase);
