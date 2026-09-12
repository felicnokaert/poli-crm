import { completeTasksThrough } from './workspace.mjs';
import { findStaleHotLeads } from './hot-leads-radar.mjs';
import { buildRepurchaseRadar } from './repurchase-radar.mjs';
import { findColdQuotes } from './cold-quotes.mjs';

const EMPTY_STATE = { tasks: [], tasksClosedThrough: '' };

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

// Combina el cierre de tareas vencidas con el cálculo/persistencia de las
// señales diarias, para que api/cron-daily-maintenance.js llame una sola
// función por fila de workspace_states.
export function buildFullDailyMaintenanceUpdate(state = EMPTY_STATE, nowISO = new Date().toISOString()) {
  const tasksUpdate = buildDailyMaintenanceUpdate(state, nowISO);
  const signalsUpdate = buildDailySignalsUpdate(tasksUpdate.nextState, nowISO);
  return {
    changed: tasksUpdate.changed || signalsUpdate.changed,
    nextState: signalsUpdate.nextState,
    summary: { ...tasksUpdate.summary, ...signalsUpdate.summary },
  };
}
