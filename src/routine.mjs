// Rutina diaria de Felipe (vigente desde el 16/10/2026). Sale del Plan Comercial Trimestral:
// 15 contactos nuevos, 8-10 efectivos, 3-4 visitas, 2-3 cotizaciones y ~1 cliente nuevo por semana,
// más Mercado Libre, Shopify y contenido. "Base" = ~6,5 h; con los bloques extra llega a 8 h.
export const WEEKLY_TARGETS = [
  ['Contactos nuevos', '15 por semana (3 por día)'],
  ['Contactos efectivos', '8 a 10 por semana'],
  ['Visitas o relevamientos técnicos', '3 a 4 por semana'],
  ['Cotizaciones o propuestas', '2 a 3 por semana'],
  ['Clientes nuevos', 'aproximadamente 1 por semana o quincena'],
  ['Sesión audiovisual', '1 por semana: 3 a 5 productos, Drive con guion en 24 h'],
];

// view = pantalla del CRM a la que lleva el bloque; extra = bloque que suma si hay tiempo.
const DAILY = [
  { id: 'arranque', start: '08:30', minutes: 30, title: 'Arranque', detail: 'Por revisar (entradas nuevas), seguimientos vencidos y el Plan de hoy.', view: 'inbox' },
  { id: 'prospeccion', start: '09:00', minutes: 90, title: 'Prospección B2B', detail: '3 contactos nuevos de la cola de trabajo: usá el borrador de la ficha y marcá el resultado. Foco: carroceros, frío industrial, náutica, constructoras y agro.', view: 'prospecting' },
  { id: 'seguimientos', start: '10:30', minutes: 90, title: 'Seguimientos y cotizaciones', detail: 'Responder, segundo intento y armar las cotizaciones o propuestas pendientes. Nada de "¿alguna novedad?": aportá algo nuevo.', view: 'tasks' },
  { id: 'dia', start: '13:30', minutes: 90, title: '', detail: '', view: null },
  { id: 'efectivos', start: '15:00', minutes: 60, title: 'Contactos efectivos', detail: 'Llamadas, visitas o relevamientos técnicos con clientes y prospectos con interés.', view: 'pipeline' },
  { id: 'competencia', start: '16:00', minutes: 30, title: 'Competencia e investigación', detail: 'Cargar un competidor que apareció, pedir investigaciones y revisar las fichas sin revisar.', view: 'prospecting', extra: true },
  { id: 'academia', start: '16:30', minutes: 30, title: 'Academia', detail: 'Un role-play o repasar una objeción; sumar un aprendizaje reutilizable.', view: 'academy', extra: true },
  { id: 'datos', start: '17:00', minutes: 30, title: 'Orden de datos', detail: 'Posibles duplicados, fichas incompletas y datos de contacto que faltan.', view: 'clients', extra: true },
  { id: 'cierre', start: '17:30', minutes: 30, title: 'Cierre del día', detail: 'Registrar lo que pasó con cada contacto, dejar las tareas de mañana y tildar esta rutina.', view: 'tasks' },
];

const DAY_BLOCK = {
  1: { title: 'Mercado Libre', detail: 'Revisar la auditoría semanal (reputación, reclamos, preguntas sin responder) y resolver lo urgente. La auditoría la corre la tarea programada: acá se actúa sobre el resultado.' },
  2: { title: 'Shopify: catálogo y SEO', detail: 'Revisar la auditoría del martes y ordenar productos en borrador, títulos y descripciones. Sin cargar precio ni stock sin dato real.' },
  3: { title: 'Contenido y guiones', detail: 'Lista de grabación y guiones de la semana; si toca, sesión audiovisual en Berazategui (3 a 5 productos, subir a Drive con guion en 24 h).' },
  4: { title: 'Shopify: ventas y operación', detail: 'Revisar la auditoría del jueves: pedidos, stock e inventario, y lo que quedó sin resolver.' },
  5: { title: 'Cierre comercial de la semana', detail: 'Tablero de indicadores de la semana, balance contra las metas, plan de la próxima semana y procesar los pedidos de investigación pendientes con Claude.', view: 'dashboard' },
};

function parts(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return { y, m, d, weekday: new Date(y, m - 1, d, 12).getDay() };
}

// Avisos puntuales según la fecha (balances, fechas clave del plan).
export function specialsForDate(date) {
  const { m, d, weekday } = parts(date);
  const out = [];
  if (d === 1) out.push('Hoy además: balance del mes y ajuste de metas (resumen mensual).');
  if (d === 15) out.push('Hoy además: monitor de competencia en Mercado Libre.');
  if (weekday === 5 && d >= 25) out.push('Fin de mes: preparar el balance mensual.');
  if ((m === 10 && d >= 28) || (m === 11 && d <= 3)) out.push('Evaluación de los 90 días del Plan Comercial: cartera nueva contra el mínimo (10 a 15 clientes), facturación outbound y recompra.');
  return out;
}

export function routineForDate(date) {
  const { weekday } = parts(date);
  const day = DAY_BLOCK[weekday];
  if (!day) return { weekend: true, blocks: [], baseMinutes: 0, totalMinutes: 0, specials: [] };
  const blocks = DAILY.map((block) => (block.id === 'dia' ? { ...block, ...day } : block));
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const base = blocks.filter((block) => !block.extra).reduce((sum, block) => sum + block.minutes, 0);
  return { weekend: false, blocks, baseMinutes: base, totalMinutes: total, specials: specialsForDate(date) };
}

export function routineKey(date, blockId) {
  return `rutina:${date}:${blockId}`;
}

export function routineProgress(planChecks = {}, date) {
  const { blocks } = routineForDate(date);
  const done = blocks.filter((block) => planChecks[routineKey(date, block.id)] === true);
  const base = blocks.filter((block) => !block.extra);
  return {
    done: done.length,
    total: blocks.length,
    minutesDone: done.reduce((sum, block) => sum + block.minutes, 0),
    baseDone: base.filter((block) => planChecks[routineKey(date, block.id)] === true).length,
    baseTotal: base.length,
  };
}

export function hoursLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function addDays(date, delta) {
  const { y, m, d } = parts(date);
  const next = new Date(y, m - 1, d + delta, 12);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

// Días hábiles seguidos (hasta ayer, o hoy si ya está completo) con la rutina base cumplida.
export function routineStreak(planChecks = {}, date) {
  let streak = 0;
  let cursor = date;
  const full = (day) => { const p = routineProgress(planChecks, day); return p.baseTotal > 0 && p.baseDone === p.baseTotal; };
  if (!routineForDate(cursor).weekend && !full(cursor)) cursor = addDays(cursor, -1);
  for (let i = 0; i < 60; i += 1) {
    if (routineForDate(cursor).weekend) { cursor = addDays(cursor, -1); continue; }
    if (!full(cursor)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function weekDates(date) {
  const { weekday } = parts(date);
  const monday = addDays(date, -((weekday + 6) % 7));
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}

export function nextWorkday(date) {
  let next = addDays(date, 1);
  while (!routineForDate(next).blocks.length) next = addDays(next, 1);
  return next;
}

export function previousWorkday(date) {
  let prev = addDays(date, -1);
  while (!routineForDate(prev).blocks.length) prev = addDays(prev, -1);
  return prev;
}
