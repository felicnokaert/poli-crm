import { completeTasksThrough } from './workspace.mjs';

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
