// Cierre del día: qué salió bien, qué quedó pendiente y qué se postergó, a partir de la rutina
// y de las tareas. Pura: no toca datos, solo los lee.
import { nextWorkday, routineForDate, routineKey } from './routine.mjs';

const TZ = 'America/Argentina/Buenos_Aires';

// Fecha local (Argentina) de un instante ISO, como AAAA-MM-DD.
export function localDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

// Instantes de cierre que comparten dos o más tareas: una persona no tilda dos tareas en el mismo
// milisegundo, el cierre automático de vencidas sí (todas con la misma hora). Sirve para las que
// cerró una versión vieja de la app, abierta en otra compu, que todavía no las marcaba (autoClosed).
export function batchStamps(tasks = []) {
  const count = new Map();
  for (const task of tasks) if (task.done && task.completedAt) count.set(task.completedAt, (count.get(task.completedAt) || 0) + 1);
  return new Set([...count].filter(([, total]) => total > 1).map(([stamp]) => stamp));
}

// La cerró el sistema, no la persona: marcadas desde el 16/10 (autoClosed), cerradas en tanda
// (batchStamps) o, las de antes, tareas automáticas cerradas en la corrida diaria de las 6:00 UTC.
export function closedBySystem(task = {}, stamps = null) {
  if (task.autoClosed) return true;
  if (stamps && task.completedAt && stamps.has(task.completedAt)) return true;
  if (!String(task.source || '').startsWith('auto-') || !task.completedAt) return false;
  const time = String(task.completedAt).slice(11, 16);
  return time >= '06:00' && time < '06:30';
}

const byPriority = (a, b) => (b.priority === 'Alta') - (a.priority === 'Alta') || String(a.title).localeCompare(String(b.title));

export function reviewDay(date, { planChecks = {}, tasks = [], includeRoutine = true } = {}) {
  const day = includeRoutine ? routineForDate(date) : { ...routineForDate(date), blocks: [] };
  // Las tareas automáticas ("Retomar contacto", "Responder a…") son alertas, no tareas que la persona
  // se puso: viven en Alertas de Inicio. Al Cierre del día solo llegan si la persona las resolvió (16/10).
  const auto = (task) => String(task.source || '').startsWith('auto-');
  const stamps = batchStamps(tasks);
  const bySystem = (task) => closedBySystem(task, stamps);
  const real = tasks.filter((task) => task.kind !== 'evento' && !task.deleted && (!auto(task) || (task.done && !bySystem(task))));
  const blocksDone = day.blocks.filter((block) => planChecks[routineKey(date, block.id)] === true);
  const blocksMissed = day.blocks.filter((block) => !block.extra && planChecks[routineKey(date, block.id)] !== true);
  // Lo que el sistema cerró solo por vencido no es algo que "salió bien".
  const doneTasks = real.filter((task) => task.done && !bySystem(task) && localDate(task.completedAt) === date).sort(byPriority);
  const pendingTasks = real.filter((task) => !task.done && task.dueDate === date).sort(byPriority);
  const postponedTasks = real.filter((task) => !task.done && (task.postponedFrom || []).includes(date)).sort(byPriority);
  const carried = real.filter((task) => !task.done && task.dueDate && task.dueDate < date).sort(byPriority);
  const tomorrow = nextWorkday(date);
  const tomorrowTasks = real.filter((task) => !task.done && task.dueDate === tomorrow).sort(byPriority);
  const base = day.blocks.filter((block) => !block.extra).length;
  const baseDone = base - blocksMissed.length;
  const score = base ? Math.round((baseDone / base) * 100) : null;
  return {
    date,
    weekend: day.weekend,
    routine: { done: blocksDone, missed: blocksMissed, base, baseDone, score },
    doneTasks,
    pendingTasks,
    postponedTasks,
    carried,
    tomorrow,
    tomorrowTasks,
    headline: headline({ weekend: day.weekend, score, doneTasks, pendingTasks, carried }),
  };
}

function headline({ weekend, score, doneTasks, pendingTasks, carried }) {
  if (weekend) return 'Fin de semana: sin rutina. Descansá.';
  const parts = [];
  if (score !== null) parts.push(score >= 100 ? 'Rutina base completa.' : `Rutina base al ${score}%.`);
  parts.push(doneTasks.length ? `${doneTasks.length} ${doneTasks.length === 1 ? 'tarea resuelta' : 'tareas resueltas'}.` : 'Sin tareas resueltas.');
  if (pendingTasks.length) parts.push(`${pendingTasks.length} sin hacer.`);
  if (carried.length) parts.push(`${carried.length} vencidas de días anteriores.`);
  return parts.join(' ');
}

// Postergar una tarea: guarda de qué día se movió, para poder contarlo después.
export function postponeTask(task, toDate, stamp = new Date().toISOString()) {
  const from = task.dueDate;
  return {
    ...task,
    dueDate: toDate,
    postponedCount: (task.postponedCount || 0) + 1,
    postponedFrom: from && !(task.postponedFrom || []).includes(from) ? [...(task.postponedFrom || []), from] : task.postponedFrom || [],
    updatedAt: stamp,
  };
}
