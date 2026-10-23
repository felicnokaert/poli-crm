// Resumen de la semana para Felipe y David (22/10): un texto listo para copiar (WhatsApp o mail) con lo que
// pasó en los últimos 7 días y lo que hay que mirar. Sin IA ni costo; los números salen de la facturación de
// Contabilium (assistant-business), de la Cola del día y de las tareas.
import { REJECTION_REASONS } from './prospect-model.mjs';

const OWNERS = ['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com', 'marketing@grupopoliplast.com.ar', 'david@grupopoliplast.com.ar'];
export const canSeeWeeklySummary = (email) => OWNERS.includes(String(email || '').trim().toLowerCase());

const DAY = 86400000;
const dm = (iso) => String(iso).slice(5, 10).split('-').reverse().join('/');
const inWeek = (value, since, today) => { const day = String(value || '').slice(0, 10); return day >= since && day <= today; };
const INTEREST = /con inter[eé]s|pidi[oó] cotizaci|respondi[oó], sigue/i;

// shared: los contactos que anotaron los demás (team_shared_notes, kind "contacto"), así el resumen es del equipo.
export function weekActivity({ prospects = [], clients = [], tasks = [], shared = [], today }) {
  const since = new Date(Date.parse(today) - 6 * DAY).toISOString().slice(0, 10);
  let contacted = 0;
  let interested = 0;
  const reasons = new Map();
  for (const prospect of prospects) {
    for (const entry of Array.isArray(prospect?.history) ? prospect.history : []) {
      if (!inWeek(entry.at, since, today)) continue;
      contacted += 1;
      if (INTEREST.test(`${entry.state} ${entry.outcome}`)) interested += 1;
      else if (REJECTION_REASONS.includes(entry.outcome)) reasons.set(entry.outcome, (reasons.get(entry.outcome) || 0) + 1);
    }
  }
  for (const client of clients) {
    for (const entry of Array.isArray(client?.contactLog) ? client.contactLog : []) {
      if (!inWeek(entry.at, since, today)) continue;
      contacted += 1;
      if (INTEREST.test(entry.outcome || '')) interested += 1;
      else if (REJECTION_REASONS.includes(entry.outcome)) reasons.set(entry.outcome, (reasons.get(entry.outcome) || 0) + 1);
    }
  }
  const people = new Set();
  for (const row of shared) {
    if (!inWeek(row.noted_at, since, today)) continue;
    contacted += 1;
    people.add(row.author_name || row.author_email);
    const outcome = String(row.outcome || '').split(' · ').pop();
    if (INTEREST.test(row.outcome || '')) interested += 1;
    else if (REJECTION_REASONS.includes(outcome)) reasons.set(outcome, (reasons.get(outcome) || 0) + 1);
  }
  const alive = tasks.filter((task) => task && !task.deleted && !task.deletedAt);
  return {
    since,
    others: people.size,
    contacted,
    interested,
    topReason: [...reasons.entries()].sort((a, b) => b[1] - a[1])[0] || null,
    tasksDone: alive.filter((task) => task.done && inWeek(task.completedAt || task.updatedAt, since, today)).length,
    tasksLate: alive.filter((task) => !task.done && task.dueDate && task.dueDate < today).length,
  };
}

export function weeklySummaryText({ facts = null, activity, gaps = null, today }) {
  const lines = [`*Resumen semanal del CRM* (${dm(activity.since)} al ${dm(today)})`];
  lines.push(`• Cola del día${activity.others ? ` (vos y ${activity.others} más del equipo)` : ''}: ${activity.contacted} contactos anotados, ${activity.interested} con interés${activity.topReason ? `; el motivo de rechazo más común fue "${activity.topReason[0]}" (${activity.topReason[1]})` : ''}.`);
  lines.push(`• Tareas: ${activity.tasksDone} hechas en la semana, ${activity.tasksLate} vencidas sin hacer.`);
  const quotes = facts?.quotes;
  if (quotes?.quotes) {
    const month = quotes.byMonth.at(-1);
    lines.push(`• Cotizaciones (Contabilium, 12 meses): se cierra el ${quotes.rate ?? '—'} %${quotes.medianDays != null ? ` en ${quotes.medianDays} días` : ''}.${month ? ` Este mes: ${month.quotes} cotizadas, ${month.closed} ya facturadas.` : ''}`);
  }
  if (facts?.overdue?.length) lines.push(`• Se pasaron de su frecuencia de compra: ${facts.overdue.length}${facts.overdue.length >= 10 ? ' o más' : ''} (${facts.overdue.slice(0, 5).map((item) => item.client.company).join(', ')}).`);
  if (facts?.reactivate?.length) lines.push(`• Buenos clientes dormidos para reactivar: ${facts.reactivate.slice(0, 5).map((item) => item.client.company).join(', ')}.`);
  if (gaps != null) lines.push(`• Asistente: ${gaps} pregunta${gaps === 1 ? '' : 's'} sin buena respuesta para enseñarle (Más → Datos → Asistente).`);
  lines.push('Detalle en el CRM: Prospección → Cola del día.');
  return lines.join('\n');
}
