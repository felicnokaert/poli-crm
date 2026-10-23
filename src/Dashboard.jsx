import { AttentionPanel } from "./AttentionPanel.jsx";
import { memo, useEffect, useMemo, useState } from "react";
import { resolveWeeklyTargets } from "./weekly-targets.mjs";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Flame,
  ListChecks,
  MessageCircle,
  Plus,
  X,
} from "lucide-react";
import { buildRepurchaseRadar } from "./repurchase-radar.mjs";
import { useComprobantes, argentinaToday } from "./CustomerBasePanel.jsx";
import { buildCustomerBase } from "./customer-base.mjs";
import { overdueQueue } from "./daily-queues.mjs";
import { businessFacts } from "./assistant-business.mjs";
import { weekActivity, weeklySummaryText } from "./weekly-summary.mjs";
import { useTeamSharedNotes } from "./hooks/useSharedNotesSync";
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
import { todayPlan } from "./today-plan.mjs";
import { TaskList } from "./Tasks";
import { IntegrationsAlert } from "./IntegrationsStatus.jsx";

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
// diario llevaba SEMANAS sin correr ni una sola vez sin que nadie lo notara,
// porque "El sistema no generó tareas automáticas hoy" (el mensaje de abajo)
// se ve idéntico tanto si el cron corrió y no encontró nada, como si nunca
// corrió.
//
// Lee `cronStatus` (tabla crm_system_status, ver useCronStatus), que solo
// escribe el servidor. Antes leía dailySignals.calculatedAt, pero ese campo
// vive dentro de workspace_states.data, que cada navegador guarda completo:
// una pestaña con estado viejo lo pisaba y daba un aviso falso de "7 días"
// aunque el cron hubiera corrido todos los días (25/09/2026).
//   undefined = todavía no se sabe / modo local -> no se avisa nada
//   null      = nunca se registró una corrida
function cronHealth(cronStatus) {
  if (cronStatus === undefined) return { known: false, ok: true, hoursSince: null, lastRunFailed: false };
  if (!cronStatus?.lastRunAt) return { known: true, ok: false, hoursSince: null, lastRunFailed: false };
  const hoursSince = (Date.now() - new Date(cronStatus.lastRunAt).getTime()) / 3_600_000;
  return { known: true, ok: hoursSince <= CRON_STALE_HOURS, hoursSince, lastRunFailed: cronStatus.ok === false };
}

// Indicador chico de auditabilidad (ver AUDITORIA_MADUREZ_PRODUCTO_2026-09-14-tarde):
// hasta ahora las tareas que crea el cron (buildAutoFollowupTasks) quedaban
// mezcladas en la lista de tareas sin ninguna marca visible de que las armó
// el sistema y no una persona. Cuenta cuántas tareas auto-generadas se
// crearon HOY (por `createdAt`, no por `dueDate`, que puede quedar viejo si
// una tarea sigue abierta) para que Felipe pueda notar de un vistazo si el
// cron corrió y qué tan activo estuvo, sin tener que abrir cada tarea.
function AutomationSummary({ tasks, cronStatus }) {
  const { ok: cronOk, hoursSince, lastRunFailed } = cronHealth(cronStatus);
  if (!cronOk) {
    const sinceText = hoursSince === null
      ? "todavía no corrió nunca"
      : `no corrió en las últimas ${Math.max(1, Math.round(hoursSince / 24))} día(s)`;
    return (
      <div className="automation-note is-warning">
        <CircleAlert size={15} />
        <span>
          ⚠️ El mantenimiento diario {sinceText} - revisar Vercel → Cron Jobs,
          la variable <code>CRON_SECRET</code> y el respaldo de GitHub Actions.
        </span>
      </div>
    );
  }
  if (lastRunFailed) {
    return (
      <div className="automation-note is-warning">
        <CircleAlert size={15} />
        <span>⚠️ La última corrida del mantenimiento diario terminó con errores en algún workspace - revisar los logs de Vercel.</span>
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
    // Solo lo del día: cotizaciones frías/vencidas, sin contacto y recompra ya están en Alertas, abajo
    // (antes aparecían dos veces en Inicio, 16/10). Se suman al plan desde ahí si hace falta.
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

// Primeros pasos para un espacio recién creado (ver shouldShowWelcome en
// src/weekly-targets.mjs). Desaparece sola apenas hay datos o al cerrarla.
function WelcomePanel({ name, onNavigate, onNewInteraction, onDismiss }) {
  const steps = [
    ["1", "Cargá tus clientes", "Sumá las empresas con las que trabajás.", "Ir a Empresas", () => onNavigate("clients")],
    ["2", "Registrá una conversación", "Anotá un contacto reciente y el sistema te propone el próximo paso.", "Registrar conversación", onNewInteraction],
    ["3", "Poné tus metas", "Definí cuántos contactos y propuestas querés lograr por semana.", "Ir a Perfil", () => onNavigate("profile")],
  ];
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Primeros pasos</span>
          <h2>{name ? `Bienvenido/a, ${name}` : "Bienvenido/a"}</h2>
        </div>
      </div>
      <p>Este es tu espacio personal: lo que cargues acá lo ves solo vos. Tres pasos para arrancar:</p>
      <div className="day-mode-list">
        {steps.map(([number, title, text, action, onClick]) => (
          <div className="day-mode-item" key={number}>
            <div>
              <strong>{number}. {title}</strong>
              <p>{text}</p>
            </div>
            <button type="button" className="secondary" onClick={onClick}>{action}</button>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="link-button" onClick={onDismiss}>Ya entendí, ocultar esto</button>
      </div>
    </section>
  );
}

// Número que sube de 0 al valor real al cargar. Sin animación si el usuario
// pidió menos movimiento, si no hay requestAnimationFrame o si no es un número.
function CountUp({ value }) {
  const target = Number(value);
  const animable =
    Number.isFinite(target) &&
    target > 0 &&
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function" &&
    !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (!animable) {
      setShown(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const duration = 700;
    const step = (time) => {
      const progress = Math.min(1, (time - start) / duration);
      setShown(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [target, animable]);
  return <>{animable ? shown : value}</>;
}

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

// Saludo + resumen del día + las tres tareas más urgentes, arriba de todo.
function DayHero({ name, overdueTasks, dueTodayTasks, hotLeads, tasks, onOpenTask, onToggle }) {
  const date = new Date();
  const dateLabel = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const urgent = [...overdueTasks]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .concat(dueTodayTasks)
    .slice(0, 3);
  const pending = tasks.filter((task) => !task.done).length;
  const parts = [];
  if (overdueTasks.length) parts.push(`${overdueTasks.length} vencida${overdueTasks.length === 1 ? "" : "s"}`);
  if (dueTodayTasks.length) parts.push(`${dueTodayTasks.length} para hoy`);
  if (hotLeads.length) parts.push(`${hotLeads.length} mensaje${hotLeads.length === 1 ? "" : "s"} caliente${hotLeads.length === 1 ? "" : "s"} sin responder`);
  const summary = parts.length
    ? `Hoy tenés ${parts.join(", ")}.`
    : pending
      ? `Sin urgencias. Tenés ${pending} tarea${pending === 1 ? "" : "s"} pendiente${pending === 1 ? "" : "s"}.`
      : "Todo al día. Buen momento para prospectar o registrar conversaciones.";
  return (
    <section className="panel day-hero">
      <div className="day-hero-head">
        <span className="eyebrow">{dateLabel}</span>
        <h2>{greetingFor(date)}{name ? `, ${name}` : ""}</h2>
        <p>{summary}</p>
      </div>
      {urgent.length > 0 && (
        <div className="day-hero-urgent">
          <span className="day-mode-subhead">Lo más urgente</span>
          <TaskList items={urgent} onToggle={onToggle} onOpen={onOpenTask} emptyText="" />
        </div>
      )}
    </section>
  );
}

function MyDay({ planChecks, tasks, onNavigate }) {
  const now = new Date();
  const plan = todayPlan(today(), { planChecks, tasks, nowMinutes: now.getHours() * 60 + now.getMinutes() });
  if (plan.weekend) return null;
  const pct = plan.progress.total ? Math.round((plan.progress.done / plan.progress.total) * 100) : 0;
  return (
    <section className="panel my-day" aria-label="Mi día">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Mi día</span>
          <h2>{plan.progress.done} de {plan.progress.total} bloques · {plan.doneLabel}</h2>
        </div>
        <button type="button" className="secondary" onClick={() => onNavigate?.("tasks")}>Abrir rutina y cierre</button>
      </div>
      <div className="my-day-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
      <div className="my-day-grid">
        <div>
          <h4>Ahora toca</h4>
          {plan.next
            ? <p><strong>{plan.next.start} · {plan.next.title}</strong> <span className="muted small">{plan.next.minutes} min</span><br /><span className="muted small">{plan.next.detail}</span>{plan.next.view && <> <button type="button" className="link-button" onClick={() => onNavigate?.(plan.next.view)}>Ir</button></>}</p>
            : <p className="muted small">Rutina completa. Buen día.</p>}
        </div>
        <div>
          <h4>Con hora hoy</h4>
          {plan.events.length
            ? <ul>{plan.events.slice(0, 5).map((event) => <li key={event.id}><strong>{event.startTime}</strong> {event.title}</li>)}</ul>
            : <p className="muted small">Sin visitas ni reuniones cargadas.</p>}
        </div>
        <div>
          <h4>Quedó del día anterior</h4>
          {plan.leftover
            ? <p>{plan.leftover} {plan.leftover === 1 ? "tarea" : "tareas"} sin hacer. <button type="button" className="link-button" onClick={() => onNavigate?.("tasks")}>Resolver</button></p>
            : <p className="muted small">Nada pendiente.</p>}
        </div>
      </div>
    </section>
  );
}

function DashboardBase({
  session = null,
  metrics,
  tasks,
  interactions,
  clients,
  sales,
  inbox,
  myChannels,
  dailySignals,
  cronStatus,
  whatsappHealth,
  onToggle,
  onOpenTask,
  onOpenInteraction,
  onOpenEvent,
  onNavigate,
  weeklyTargets,
  planChecks,
  showRoutine = true,
  showWelcome,
  welcomeName,
  onDismissWelcome,
  onNewInteraction,
  supabase = null,
  prospects = [],
  showWeekly = false,
  isAdmin = false,
}) {
  const targets = resolveWeeklyTargets(weeklyTargets);
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
  // Lo guardado por el proceso de las 6 de la mañana puede nombrar empresas que después se limpiaron o
  // se sacaron del pipeline (le pasó a Juan, 16/10): solo se muestran las que siguen activas hoy.
  const workedClientIds = new Set(clients.filter((client) => client.pipelineActive !== false).map((client) => client.id));
  const stillWorked = (item) => workedClientIds.has(item.clientId);
  const staleClients = (signalsAreFresh ? (dailySignals.staleClients || []).filter(stillWorked) : findStaleClients(clients, sales, inbox)).slice(0, 6);
  const expiredQuotes = (signalsAreFresh ? (dailySignals.expiredQuotes || []).filter(stillWorked) : findExpiredQuotes(clients, sales)).slice(0, 6);
  const overdueTasks = tasks.filter((task) => !task.done && task.kind !== "evento" && task.dueDate && task.dueDate < now);
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
    ["Contactos esta semana", metrics.contacts, `Meta: ${targets.contacts}`, MessageCircle],
    ["Contactos efectivos", metrics.effective, `Meta: ${targets.effective}`, CheckCircle2],
    ["Propuestas activas", metrics.proposals, `Meta: ${targets.proposals}`, BarChart3],
  ];
  return (
    <div className="content-stack">
      {showWelcome && (
        <WelcomePanel
          name={welcomeName}
          onNavigate={onNavigate}
          onNewInteraction={onNewInteraction}
          onDismiss={onDismissWelcome}
        />
      )}
      {!showWelcome && (
        <DayHero
          name={welcomeName}
          overdueTasks={overdueTasks}
          dueTodayTasks={dueTodayTasks}
          hotLeads={hotLeads}
          tasks={tasks}
          onOpenTask={onOpenTask}
          onToggle={onToggle}
        />
      )}
      {!showWelcome && showRoutine && <MyDay planChecks={planChecks || {}} tasks={tasks} onNavigate={onNavigate} />}
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
      <section className="metric-grid metric-grid-week">
        {cards.map(([label, value, note, Icon, urgent]) => (
          <article className={`metric-card${urgent ? " is-urgent" : ""}`} key={label}>
            <Icon size={20} />
            <span>{label}</span>
            <strong><CountUp value={value} /></strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      {whatsappHealth && whatsappHealth.ok === false && myChannels.includes("general") && (
        <section className="panel whatsapp-alert" role="alert">
          <strong>WhatsApp: hay algo para revisar</strong>
          <ul>{whatsappHealth.problems.map((line, index) => <li key={index}>{line}</li>)}</ul>
          <button type="button" className="secondary" onClick={() => onNavigate("settings")}>Ir a Datos para el diagnóstico</button>
        </section>
      )}
      {supabase && showWeekly && <WeeklySummaryCard supabase={supabase} clients={clients} prospects={prospects} tasks={tasks} isAdmin={isAdmin} />}
      {supabase && isAdmin && <AttentionPanel supabase={supabase} session={session} isAdmin={isAdmin} onNavigate={onNavigate} compact />}
      {supabase && <OverdueCard supabase={supabase} clients={clients} onNavigate={onNavigate} />}
      <AlertsPanel hotLeads={hotLeads} coldQuotes={coldQuotes} expiredQuotes={expiredQuotes} staleClients={staleClients} repurchaseRadar={repurchaseRadar} onNavigate={onNavigate} />
      <AutomationSummary tasks={tasks} cronStatus={cronStatus} />
      {supabase && isAdmin && <IntegrationsAlert supabase={supabase} onNavigate={onNavigate} />}
    </div>
  );
}

// Clientes que se pasaron de su frecuencia de compra (22/10), con la facturación de Contabilium. Espera unos
// segundos para no demorar la entrada a Inicio; la lectura queda en memoria y la reusa la Cola del día.
function OverdueCard({ supabase, clients, onNavigate }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 2500); return () => clearTimeout(timer); }, []);
  return ready ? <OverdueList supabase={supabase} clients={clients} onNavigate={onNavigate} /> : null;
}
function OverdueList({ supabase, clients, onNavigate }) {
  const { status, rows } = useComprobantes(supabase);
  const today = argentinaToday();
  const list = useMemo(() => (status === "ready" ? overdueQueue({ clients, base: buildCustomerBase(rows, clients, { today }).byClient, today, limit: 50 }) : []), [status, rows, clients, today]);
  if (!list.length) return null;
  const open = () => { try { sessionStorage.setItem("poliplast-queue-view", "atrasados"); } catch { /* sin almacenamiento: abre la cola igual */ } onNavigate?.("prospecting"); };
  return (
    <section className="panel overdue-card" aria-label="Se pasaron de su frecuencia">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Plata que se escapa</span>
          <h2>{list.length} {list.length === 1 ? "cliente se pasó" : "clientes se pasaron"} de su frecuencia de compra</h2>
        </div>
      </div>
      <p className="muted small">{list.slice(0, 3).map((item) => `${item.client.company} (+${item.late} días)`).join(" · ")}{list.length > 3 ? "…" : ""}</p>
      <button type="button" className="primary" onClick={open}>Ver la lista con el mensaje listo</button>
    </section>
  );
}

// Resumen de la semana (22/10, Felipe y David): se arma al tocar el botón (lee la facturación) y se copia.
function WeeklySummaryCard({ supabase, clients, prospects, tasks, isAdmin }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel weekly-summary" aria-label="Resumen de la semana">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Para vos y David</span>
          <h2>Resumen de la semana</h2>
        </div>
        {!open && <button type="button" className="secondary" onClick={() => setOpen(true)}>Armar el resumen</button>}
      </div>
      {open && <WeeklySummaryBody supabase={supabase} clients={clients} prospects={prospects} tasks={tasks} isAdmin={isAdmin} />}
    </section>
  );
}
function WeeklySummaryBody({ supabase, clients, prospects, tasks, isAdmin }) {
  const { status, rows } = useComprobantes(supabase);
  const [gaps, setGaps] = useState(null);
  const [copied, setCopied] = useState(false);
  const today = argentinaToday();
  // 23/10: los contactos de la Cola del día que anotó el resto del equipo en la semana.
  const sinceIso = useMemo(() => new Date(Date.now() - 8 * 86400000).toISOString(), []);
  const shared = useTeamSharedNotes(supabase, { kind: "contactos", sinceIso });
  useEffect(() => {
    // Las preguntas sin respuesta solo las lee Felipe (para el resto la base devuelve 0: no se muestra).
    if (!isAdmin) return undefined;
    let active = true;
    Promise.resolve(supabase.from("assistant_feedback").select("id", { count: "exact", head: true }).is("resolved_at", null))
      .then(({ count, error }) => { if (active && !error && Number.isFinite(count)) setGaps(count); }, () => {});
    return () => { active = false; };
  }, [supabase, isAdmin]);
  const text = useMemo(() => {
    const facts = status === "ready" ? businessFacts(rows, clients, today) : null;
    return weeklySummaryText({ facts, activity: weekActivity({ prospects, clients, tasks, shared, today }), gaps, today });
  }, [status, rows, clients, prospects, tasks, shared, gaps, today]);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }
  return (
    <>
      {status !== "ready" && status !== "error" && <p className="muted small" role="status">Leyendo la facturación de Contabilium…</p>}
      <textarea readOnly rows={9} value={text} aria-label="Resumen de la semana" />
      <button type="button" className="primary" onClick={copy}>{copied ? "Copiado ✓" : "Copiar para WhatsApp"}</button>
    </>
  );
}

// Inicio (16/10): las cinco alertas que antes eran cinco paneles sueltos van en uno solo con pestañas,
// cada una con su cantidad. Arranca en la primera que tenga algo.
function AlertsPanel({ hotLeads, coldQuotes, expiredQuotes, staleClients, repurchaseRadar, onNavigate }) {
  const tabs = [
    ["hot", "Calientes sin responder", hotLeads, "Mensajes en «Por revisar» que suenan urgentes y comerciales, con más de 2 días sin tocar."],
    ["cold", "Cotizaciones frías", coldQuotes, "Pidieron precio por WhatsApp y no volvieron."],
    ["expired", "Cotizaciones vencidas", expiredQuotes, "Marcaste «Coticé hoy» hace 15 días o más y no hay venta."],
    ["stale", "Clientes sin contacto", staleClients, "Empresas en seguimiento sin venta ni mensaje en 30 días o más."],
    ["repurchase", "Para reponer", repurchaseRadar, "Por su ritmo de compra, ya deberían haber vuelto a comprar."],
  ];
  const firstWithItems = tabs.find(([, , items]) => items.length)?.[0] || "hot";
  const [tab, setTab] = useState(firstWithItems);
  const [key, label, items, help] = tabs.find(([k]) => k === tab) || tabs[0];
  const total = tabs.reduce((sum, [, , list]) => sum + list.length, 0);
  const row = (item) => {
    if (key === "repurchase") {
      return (
        <article className="radar-row" key={`${item.customer}-${item.product}`}>
          <div><strong>{item.customer}</strong><span>{item.product}</span></div>
          <div><span className="radar-badge overdue">+{item.overdueDays}d</span><small>cada {item.avgIntervalDays}d, último hace {item.daysSinceLast}d{item.avgQuantity ? ` · ~${item.avgQuantity} por compra` : ""}</small></div>
        </article>
      );
    }
    const target = key === "hot" || key === "cold" ? "inbox" : "clients";
    return (
      <button type="button" className="radar-row radar-row-clickable" key={item.eventId || item.clientId || item.customer} onClick={() => onNavigate(target)}>
        <div><strong>{item.customer || item.company}</strong>{item.text ? <span>{item.text}</span> : null}</div>
        <div><span className={`radar-badge ${key === "hot" ? "hot" : "cold"}`}>{item.daysSince}d</span></div>
      </button>
    );
  };
  return (
    <section className="panel alerts-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Se calcula solo, todos los días</span>
          <h2>Alertas{total ? ` (${total})` : ""}</h2>
        </div>
        <Flame size={22} />
      </div>
      <div className="segmented alerts-tabs" role="tablist" aria-label="Tipo de alerta">
        {tabs.map(([k, name, list]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "selected" : ""} onClick={() => setTab(k)}>
            {name} <span className="alerts-count">{list.length}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{help}</p>
      {items.length ? items.map(row) : <Empty text={`Nada en «${label}» por ahora.`} />}
    </section>
  );
}

// Memoizado: App() re-renderiza seguido por motivos ajenos al dashboard
// (sync status, edición de otras vistas, etc.) y este componente hace un
// trabajo de armado de radares/listas nada gratis, así que conviene evitar
// re-renderizarlo cuando ninguna de sus props cambió realmente.
export const Dashboard = memo(DashboardBase);
