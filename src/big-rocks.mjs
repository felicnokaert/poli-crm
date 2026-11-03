// Las 3 piedras grandes del día (3/11, Felipe: «los 7 hábitos»: primero lo importante, no solo lo urgente) y «afilar la sierra»
// semanal. Se guardan en planChecks (ya se sincroniza): `piedra:<fecha>:<idTarea>` = elegida ese día; `sierra:<lunes>` = hecha esa semana.
import { weekDates } from './routine.mjs';

export const MAX_ROCKS = 3;
export const rockKey = (date, taskId) => `piedra:${date}:${taskId}`;
export const sierraKey = (date) => `sierra:${weekDates(date)[0]}`;

const real = (task) => task && task.kind !== 'evento' && !task.deleted && !String(task.source || '').startsWith('auto-');

// Las elegidas para ese día (aunque ya estén hechas: cuentan para el cierre).
export function chosenRocks(date, planChecks = {}, tasks = []) {
  return tasks.filter((task) => real(task) && planChecks[rockKey(date, task.id)] === true).slice(0, MAX_ROCKS);
}

const PRIORITY = { Alta: 0, Media: 1, Baja: 2 };

// Para elegir: pendientes, las de prioridad alta y las más viejas primero.
export function rockCandidates(date, planChecks = {}, tasks = [], max = 15) {
  return tasks
    .filter((task) => real(task) && !task.done && planChecks[rockKey(date, task.id)] !== true)
    .sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
    .slice(0, max);
}

export function rocksSummary(date, planChecks = {}, tasks = []) {
  const chosen = chosenRocks(date, planChecks, tasks);
  return { total: chosen.length, done: chosen.filter((task) => task.done).length };
}
