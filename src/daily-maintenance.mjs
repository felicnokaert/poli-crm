import { completeTasksThrough } from './workspace.mjs';
import { findStaleHotLeads } from './hot-leads-radar.mjs';
import { buildRepurchaseRadar } from './repurchase-radar.mjs';
import { findColdQuotes } from './cold-quotes.mjs';
import { findClientByWhatsApp } from './client-contacts.mjs';

const EMPTY_STATE = { tasks: [], tasksClosedThrough: '' };

// Marca las tareas que crea el sistema (nunca una persona) para poder
// distinguirlas al buscar duplicados. Nunca se usa para nada más.
export const AUTO_HOT_LEAD_TASK_SOURCE = 'auto-hot-lead';

function normalizedIdentity(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

// Clave de deduplicación estable entre corridas: mismo canal + mismo
// contacto (el mismo criterio que ya usa whatsappContactIdentity en
// hot-leads-radar.mjs para agrupar mensajes de un mismo contacto). No
// usamos eventId porque un lead que sigue sin respuesta al día siguiente es
// el MISMO evento (el más reciente sin clasificar de ese contacto) y no
// queremos una tarea nueva por cada corrida del cron mientras siga abierto.
function hotLeadAutoKey(hotLead) {
  return `${normalizedIdentity(hotLead.channel || 'unknown')}:${normalizedIdentity(hotLead.customer || 'unknown')}`;
}

// Mantenimiento diario que hoy solo corre client-side cuando alguien abre el
// CRM (ver src/App.jsx, TASKS_CLOSED_THROUGH). Esta función es la misma
// lógica extraída para poder correrla también desde un cron server-side
// (api/cron-daily-maintenance.js) sin depender de que alguien tenga la
// pestaña abierta.
//
// Criterio de cutoff: usamos `nowISO` completo (no solo la fecha) como
// cutoff, igual que hace App.jsx con su constante TASKS_CLOSED_THROUGH.
// completeTasksThrough() solo usa los primeros 10 caracteres (la fecha) para
// decidir qué tareas cerrar, pero guarda el cutoff completo en
// `tasksClosedThrough` - así, al comparar con `>=` la próxima corrida (con un
// ISO de otro día, lexicográficamente mayor) vuelve a disparar el cierre.
export function buildDailyMaintenanceUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const before = Array.isArray(state.tasks) ? state.tasks : [];
  const beforeDoneIds = new Set(before.filter((task) => task.done).map((task) => task.id));
  const nextState = completeTasksThrough(state, nowISO);
  if (nextState === state) {
    return { changed: false, nextState: state, summary: { tasksClosed: 0, cutoff: nowISO } };
  }
  const tasksClosed = (nextState.tasks || []).filter((task) => task.done && !beforeDoneIds.has(task.id)).length;
  return {
    changed: true,
    nextState,
    summary: { tasksClosed, cutoff: nowISO },
  };
}

// Las 3 señales de negocio (leads calientes sin respuesta, cotizaciones
// frías, radar de recompra) hoy se calculan client-side cada vez que alguien
// abre el CRM (ver src/Dashboard.jsx). Si nadie abre la app por unos días,
// esas señales no se calculan ni se guardan en ningún lado. Esta función
// corre las mismas 3 funciones puras server-side y persiste el resultado en
// `state.dailySignals`, con un timestamp de cuándo se calculó, para que la
// señal exista aunque nadie haya abierto el CRM ese día.
export function buildDailySignalsUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const inbox = Array.isArray(state.inbox) ? state.inbox : [];
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const now = new Date(nowISO);

  const hotLeads = findStaleHotLeads(inbox, { today: now });
  const coldQuotes = findColdQuotes(inbox, sales, { today: now });
  const repurchase = buildRepurchaseRadar(sales, now);

  const dailySignals = {
    calculatedAt: nowISO,
    hotLeadsCount: hotLeads.length,
    coldQuotesCount: coldQuotes.length,
    repurchaseCount: repurchase.length,
    hotLeads,
    coldQuotes,
    repurchase,
  };

  return {
    changed: true,
    nextState: { ...state, dailySignals },
    summary: {
      hotLeadsCount: hotLeads.length,
      coldQuotesCount: coldQuotes.length,
      repurchaseCount: repurchase.length,
      calculatedAt: nowISO,
    },
  };
}

// Primer paso de "el sistema actúa, no solo calcula" (ver auditorías de
// madurez, Automatización 50/100): en vez de dejar los hot leads solo
// visibles en el Dashboard para que alguien los note, el cron crea una
// tarea de seguimiento interna por cada lead caliente sin respuesta.
//
// A propósito acotado SOLO a hot leads (findStaleHotLeads), no a cotizaciones
// frías ni repurchase: es la señal más inequívoca de las 3 (mensaje entrante
// urgente + comercial, sin clasificar, con >= minDays sin respuesta) y la
// única cuyo "actuar" es obvio y de bajo riesgo (crear una tarea de "revisar
// y responder", no una recomendación ambigua). Cold quotes y repurchase son
// señales más blandas (ausencia de actividad, no un mensaje concreto
// esperando respuesta) y sumarlas de entrada arriesgaba inundar la lista de
// Tareas la primera noche - mejor validar el patrón con la señal más clara
// antes de extenderlo.
//
// Anti-duplicado: cada tarea auto-generada lleva `source: AUTO_HOT_LEAD_TASK_SOURCE`
// y un `autoKey` estable (canal + identidad del contacto, el mismo criterio
// que usa findStaleHotLeads para agrupar mensajes de un contacto). Si ya
// existe una tarea ABIERTA (done: false) con esa combinación source+autoKey,
// no se crea una segunda - así un lead que sigue sin respuesta varios días
// solo genera una tarea (la primera vez que se detecta), no una por día.
// Si la tarea existente ya se marcó `done`, se entiende que alguien la
// atendió y, si el lead vuelve a aparecer como stale más adelante (nueva
// conversación), se puede crear una tarea nueva.
export function buildAutoFollowupTasks(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const inbox = Array.isArray(state.inbox) ? state.inbox : [];
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const now = new Date(nowISO);
  const today = nowISO.slice(0, 10);

  const hotLeads = findStaleHotLeads(inbox, { today: now });
  if (!hotLeads.length) {
    return { changed: false, nextState: state, summary: { autoFollowupTasksCreated: 0 } };
  }

  const openAutoKeys = new Set(
    tasks
      .filter((task) => task.source === AUTO_HOT_LEAD_TASK_SOURCE && !task.done)
      .map((task) => task.autoKey)
      .filter(Boolean),
  );

  const newTasks = [];
  for (const hotLead of hotLeads) {
    const autoKey = hotLeadAutoKey(hotLead);
    if (openAutoKeys.has(autoKey)) continue;
    openAutoKeys.add(autoKey); // evita crear dos tareas para el mismo contacto en la misma corrida

    const event = inbox.find((item) => item.event_id === hotLead.eventId);
    const client = event ? findClientByWhatsApp(clients, event) : undefined;

    newTasks.push({
      id: crypto.randomUUID(),
      clientId: client?.id,
      company: hotLead.customer || client?.company || 'Contacto de WhatsApp',
      title: `Responder a ${hotLead.customer || 'contacto'} - lleva ${hotLead.daysSince} días sin respuesta`,
      dueDate: today,
      cadence: 'Diaria',
      priority: 'Alta',
      trigger: 'Lead caliente sin respuesta (detección automática)',
      done: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      createdBy: 'sistema',
      source: AUTO_HOT_LEAD_TASK_SOURCE,
      autoKey,
    });
  }

  if (!newTasks.length) {
    return { changed: false, nextState: state, summary: { autoFollowupTasksCreated: 0 } };
  }

  return {
    changed: true,
    nextState: { ...state, tasks: [...tasks, ...newTasks] },
    summary: { autoFollowupTasksCreated: newTasks.length },
  };
}

// Combina el cierre de tareas vencidas, el cálculo/persistencia de las
// señales diarias y la creación de tareas automáticas de seguimiento, para
// que api/cron-daily-maintenance.js llame una sola función por fila de
// workspace_states.
export function buildFullDailyMaintenanceUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const tasksUpdate = buildDailyMaintenanceUpdate(state, nowISO);
  const signalsUpdate = buildDailySignalsUpdate(tasksUpdate.nextState, nowISO);
  const followupUpdate = buildAutoFollowupTasks(signalsUpdate.nextState, nowISO);
  return {
    changed: tasksUpdate.changed || signalsUpdate.changed || followupUpdate.changed,
    nextState: followupUpdate.nextState,
    summary: { ...tasksUpdate.summary, ...signalsUpdate.summary, ...followupUpdate.summary },
  };
}
