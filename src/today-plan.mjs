// "Mi día" en Inicio: avance de la rutina, próximo bloque, eventos con hora y lo que quedó del último día hábil.
import { routineForDate, routineKey, routineProgress, hoursLabel, previousWorkday } from './routine.mjs';
import { reviewDay } from './day-review.mjs';

// Hora local "HH:MM" -> minutos, para comparar contra el inicio de cada bloque.
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function todayPlan(date, { planChecks = {}, tasks = [], nowMinutes = 0 } = {}) {
  const day = routineForDate(date);
  const progress = routineProgress(planChecks, date);
  const open = day.blocks.filter((block) => planChecks[routineKey(date, block.id)] !== true);
  const next = open.find((block) => minutesOf(block.start) + block.minutes > nowMinutes) || open[0] || null;
  const events = tasks
    .filter((task) => task.kind === 'evento' && !task.done && !task.deleted && task.dueDate === date)
    .sort((a, b) => String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99')));
  const last = reviewDay(previousWorkday(date), { planChecks, tasks });
  const leftover = last.pendingTasks.length + last.carried.length;
  return {
    weekend: day.weekend,
    progress,
    doneLabel: hoursLabel(progress.minutesDone),
    next: next && !day.weekend ? { title: next.title, start: next.start, minutes: next.minutes, detail: next.detail, view: next.view || null } : null,
    events,
    leftover,
    lastDate: last.date,
  };
}
