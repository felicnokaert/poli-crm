// Poliplast App (26/11, Felipe: «un solo calendario, que aparezca lo que le sirve a cada uno; lo compartido lo ven
// todos y lo personal es de cada uno»). Capas:
// - Feriados (todos), Entregas y Cortes de etiquetas (compartidas, si la persona tiene el módulo),
// - Mis tareas y Mis eventos (personales: salen del espacio de trabajo de cada uno, nadie más los ve).
export const LAYERS = [
  { id: 'feriados', label: 'Feriados', shared: true, module: null, color: '#ed1c24' },
  { id: 'entregas', label: 'Entregas', shared: true, module: 'entregas', color: '#2563eb' },
  { id: 'cortes', label: 'Cortes de etiquetas', shared: true, module: 'etiquetas', color: '#d97706' },
  { id: 'tareas', label: 'Mis tareas', shared: false, module: 'tasks', color: '#15803d' },
  { id: 'eventos', label: 'Mis eventos', shared: false, module: 'tasks', color: '#7c3aed' },
];

export function layersFor(allows = () => true) {
  return LAYERS.filter((layer) => !layer.module || allows(layer.module));
}

export function holidayDetail(holiday = {}) {
  if (holiday.tipo === 'empresa') return 'Cerrado (día de la empresa)';
  if (holiday.tipo === 'empresa-medio-dia') return `Medio día: cerrado desde las ${holiday.desde || '13:00'}`;
  if (holiday.tipo === 'puente') return 'Día no laborable';
  return 'Feriado';
}

const add = (map, day, event) => { if (!day) return; (map[day] ||= []).push(event); };
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

// days: lista de fechas visibles (AAAA-MM-DD). Devuelve { 'AAAA-MM-DD': [eventos] }.
export function buildCalendar({ days = [], holidays = [], tasks = [], entregas = [], cortes = null, on = new Set(LAYERS.map((layer) => layer.id)) } = {}) {
  const map = {};
  const inRange = new Set(days);
  // Medio día cerrado de la empresa: se trabaja a la mañana (los cortes de etiquetas siguen).
  const holidayByDay = new Map(holidays.filter((holiday) => holiday.tipo !== 'empresa-medio-dia').map((holiday) => [holiday.fecha, holiday]));
  if (on.has('feriados')) for (const holiday of holidays) if (inRange.has(holiday.fecha)) add(map, holiday.fecha, { layer: 'feriados', id: `fer-${holiday.fecha}-${holiday.tipo}`, title: holiday.nombre, detail: holidayDetail(holiday), half: holiday.tipo === 'empresa-medio-dia', company: String(holiday.tipo).startsWith('empresa') });
  if (on.has('tareas') || on.has('eventos')) {
    for (const task of tasks) {
      if (!task.dueDate || !inRange.has(task.dueDate) || task.deletedAt) continue;
      const isEvent = task.kind === 'evento';
      if (isEvent ? !on.has('eventos') : !on.has('tareas')) continue;
      add(map, task.dueDate, { layer: isEvent ? 'eventos' : 'tareas', id: `t-${task.id}`, taskId: task.id, title: task.title || 'Tarea', detail: [task.startTime, task.company].filter(Boolean).join(' · '), done: Boolean(task.done) });
    }
  }
  if (on.has('entregas')) {
    for (const pedido of entregas) {
      const nombre = pedido.cliente || `Pedido ${pedido.codigo || ''}`;
      if (pedido.fecha_entrega && inRange.has(pedido.fecha_entrega)) add(map, pedido.fecha_entrega, { layer: 'entregas', id: `e-${pedido.id}-ent`, title: `Entregado · ${nombre}`, detail: pedido.deposito_salida || '', done: true });
      else if (pedido.fecha_despacho && inRange.has(pedido.fecha_despacho)) add(map, pedido.fecha_despacho, { layer: 'entregas', id: `e-${pedido.id}-desp`, title: `Despachado · ${nombre}`, detail: [pedido.deposito_salida, pedido.n_guia ? `guía ${pedido.n_guia}` : ''].filter(Boolean).join(' · ') });
      else if (['cargado', 'impreso', 'bloqueado', 'incidencia'].includes(pedido.estado) && inRange.has(pedido.fecha_remito)) add(map, pedido.fecha_remito, { layer: 'entregas', id: `e-${pedido.id}-pend`, title: `Para despachar · ${nombre}`, detail: [pedido.estado, pedido.deposito_salida].filter(Boolean).join(' · ') });
    }
  }
  if (on.has('cortes') && cortes) {
    const hours = Array.isArray(cortes.cortes) && cortes.cortes.length ? cortes.cortes : [8, 10, 12];
    for (const day of days) {
      const mark = cortes.calendario?.[day];
      const workday = weekday(day) >= 1 && weekday(day) <= 5 && !holidayByDay.has(day);
      if (mark === 'sin' || mark === 'feriado' || (!mark && !workday)) { if (mark === 'sin') add(map, day, { layer: 'cortes', id: `c-${day}`, title: 'Sin corte de etiquetas', detail: '' }); continue; }
      add(map, day, { layer: 'cortes', id: `c-${day}`, title: `Cortes ${hours.map((hour) => `${hour} h`).join(' · ')}`, detail: mark === 'con' ? 'Marcado con corte' : '' });
    }
  }
  return map;
}

export function monthDays(year, month) {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7; // lunes primero
  const start = new Date(first.getTime() - offset * 86400000);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}
