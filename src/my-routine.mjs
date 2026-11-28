// Rutina propia (28/11, Felipe: «en rutina, que cada uno arme la suya»). Cada persona carga sus bloques del día
// (hora opcional, título, días de la semana) y los tilda; las marcas van en planChecks con la clave
// `mia:<fecha>:<id>`, igual que la rutina de Felipe. Lógica pura.
export const WEEKDAYS = [[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Ju'], [5, 'Vi'], [6, 'Sá']];
export const DEFAULT_DAYS = [1, 2, 3, 4, 5];
export const checkKey = (date, id) => `mia:${date}:${id}`;

const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function cleanBlock(block = {}) {
  const title = String(block.title || '').trim().slice(0, 120);
  if (!title) return null;
  const time = /^\d{1,2}:\d{2}$/.test(String(block.time || '').trim()) ? String(block.time).trim().padStart(5, '0') : '';
  const days = (Array.isArray(block.days) ? block.days : DEFAULT_DAYS).map(Number).filter((day) => day >= 1 && day <= 6);
  return { id: String(block.id || `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`), title, time, days: days.length ? days : DEFAULT_DAYS };
}

export function blocksForDate(routine = {}, date = '') {
  const day = weekdayOf(date);
  return (routine.blocks || []).filter((block) => (block.days || DEFAULT_DAYS).includes(day))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title, 'es'));
}

export function dayProgress(routine = {}, date = '', planChecks = {}) {
  const blocks = blocksForDate(routine, date);
  const done = blocks.filter((block) => planChecks[checkKey(date, block.id)]).length;
  return { total: blocks.length, done, pct: blocks.length ? Math.round((done / blocks.length) * 100) : 0 };
}

export function addBlock(routine = {}, block, now = new Date().toISOString()) {
  const clean = cleanBlock(block);
  if (!clean) return routine;
  return { ...routine, blocks: [...(routine.blocks || []), clean], updatedAt: now };
}
export function removeBlock(routine = {}, id, now = new Date().toISOString()) {
  return { ...routine, blocks: (routine.blocks || []).filter((block) => block.id !== id), updatedAt: now };
}
export function toggleDay(routine = {}, id, day, now = new Date().toISOString()) {
  return { ...routine, updatedAt: now, blocks: (routine.blocks || []).map((block) => {
    if (block.id !== id) return block;
    const days = block.days.includes(day) ? block.days.filter((item) => item !== day) : [...block.days, day].sort();
    return { ...block, days: days.length ? days : block.days };
  }) };
}
// Sugerencias para empezar (se agregan con un toque; nada viene cargado).
export const SUGGESTIONS = [
  { time: '08:30', title: 'Revisar tareas y mensajes del día' },
  { time: '09:00', title: 'Llamadas y seguimientos de clientes' },
  { time: '11:00', title: 'Cotizaciones pendientes' },
  { time: '15:00', title: 'Prospección: contactos nuevos' },
  { time: '17:00', title: 'Cierre del día' },
];
