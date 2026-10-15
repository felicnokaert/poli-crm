// Exportación a calendario (.ics) para importar en Google Calendar. Una sola vía: el CRM manda.
// Los UID son estables, así volver a importar actualiza en vez de duplicar.
import { routineForDate } from './routine.mjs';

const TZ = 'America/Argentina/Buenos_Aires';

export function icsEscape(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Cortes de línea a 75 caracteres (RFC 5545) para que Google no rechace líneas largas.
export function icsFold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ` ${rest.slice(74)}`; }
  out.push(rest);
  return out.join('\r\n');
}

const compactDate = (date) => date.replaceAll('-', '');
const compactTime = (time) => `${time.replace(':', '')}00`;
function stamp(now) { return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

function addMinutes(date, time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const day = Math.floor(total / 1440);
  const t = total % 1440;
  const [y, mo, d] = date.split('-').map(Number);
  const next = new Date(y, mo - 1, d + day, 12);
  const dateOut = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  return { date: dateOut, time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` };
}

function timed({ uid, title, date, start, end, description, location, now }) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;TZID=${TZ}:${compactDate(date)}T${compactTime(start)}`,
    `DTEND;TZID=${TZ}:${compactDate(end.date)}T${compactTime(end.time)}`,
    `SUMMARY:${icsEscape(title)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    location ? `LOCATION:${icsEscape(location)}` : null,
    'END:VEVENT',
  ].filter(Boolean);
}

function allDay({ uid, title, date, description, now }) {
  const next = addMinutes(date, '00:00', 1440);
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDate(date)}`,
    `DTEND;VALUE=DATE:${compactDate(next.date)}`,
    `SUMMARY:${icsEscape(title)}`,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    'END:VEVENT',
  ].filter(Boolean);
}

function eachDay(from, to) {
  const days = [];
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; i < 400; i += 1) {
    const x = new Date(y, m - 1, d + i, 12);
    const date = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    if (date > to) break;
    days.push(date);
  }
  return days;
}

// options: { from, to, routine, tasks, events, holidays } ; tasks = lista de tareas del CRM.
export function buildIcs(tasks = [], { from, to, routine = true, includeTasks = true, includeEvents = true, skipDays = [], now = new Date() } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grupo Poliplast//CRM//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:CRM Poliplast', `X-WR-TIMEZONE:${TZ}`];
  let count = 0;
  const inRange = (date) => date && date >= from && date <= to;
  if (routine) {
    for (const date of eachDay(from, to)) {
      if (skipDays.includes(date)) continue;
      for (const block of routineForDate(date).blocks) {
        const end = addMinutes(date, block.start, block.minutes);
        lines.push(...timed({ uid: `rutina-${compactDate(date)}-${block.id}@poli-crm`, title: `Rutina · ${block.title}`, date, start: block.start, end, description: block.detail, now }));
        count += 1;
      }
    }
  }
  for (const task of tasks || []) {
    if (task.done || !inRange(task.dueDate)) continue;
    const isEvent = task.kind === 'evento';
    if (isEvent && !includeEvents) continue;
    if (!isEvent && !includeTasks) continue;
    const description = [task.company, task.trigger, task.trelloUrl, task.notes].filter(Boolean).join(' · ');
    if (isEvent && task.startTime) {
      const end = task.endTime ? { date: task.dueDate, time: task.endTime } : addMinutes(task.dueDate, task.startTime, 60);
      lines.push(...timed({ uid: `evento-${task.id}@poli-crm`, title: task.title, date: task.dueDate, start: task.startTime, end, description, location: task.place, now }));
    } else {
      lines.push(...allDay({ uid: `tarea-${task.id}@poli-crm`, title: isEvent ? task.title : `Tarea: ${task.title}`, date: task.dueDate, description, now }));
    }
    count += 1;
  }
  lines.push('END:VCALENDAR');
  return { text: `${lines.map(icsFold).join('\r\n')}\r\n`, count };
}
