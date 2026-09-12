import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Flame,
  ListChecks,
  MessageCircle,
  Plus,
  RefreshCw,
  Snowflake,
  X,
} from "lucide-react";
import { buildRepurchaseRadar } from "./repurchase-radar.mjs";
import { findColdQuotes } from "./cold-quotes.mjs";
import { findStaleHotLeads } from "./hot-leads-radar.mjs";
import { Empty } from "./ui-primitives";
import { today } from "./app-shared";
import { TaskList } from "./Tasks";
import { InteractionRow } from "./Interactions";

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
    ...(overdueTasks.length ? [{ id: "overdue:summary", label: `Revisar ${overdueTasks.length} seguimientos vencidos en Tareas` }] : []),
    ...coldQuotes.map((item) => ({ id: `cold:${item.eventId}`, label: `Retomar cotización fría — ${item.customer}` })),
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

export function Dashboard({
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
      metrics.dueToday ? `${metrics.dueToday} para hoy` : "Ninguno para hoy",
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
