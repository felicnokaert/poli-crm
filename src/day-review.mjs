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

const byPriority = (a, b) => (b.priority === 'Alta') - (a.priority === 'Alta') || String(a.title).localeCompare(String(b.title));

export function reviewDay(date, { planChecks = {}, tasks = [] } = {}) {
  const day = routineForDate(date);
  const real = tasks.filter((task) => task.kind !== 'evento' && !task.deleted);
  const blocksDone = day.blocks.filter((block) => planChecks[routineKey(date, block.id)] === true);
  const blocksMissed = day.blocks.filter((block) => !block.extra && planChecks[routineKey(date, block.id)] !== true);
  const doneTasks = real.filter((task) => task.done && localDate(task.completedAt) === date).sort(byPriority);
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
