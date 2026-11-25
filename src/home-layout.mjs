// Poliplast App (prueba, 25/11): Inicio adaptable. Cada tarjeta del Inicio depende de un módulo: si la persona (o el
// rol que se está mirando) no lo tiene, la tarjeta no aparece. Cada uno puede ordenar sus tarjetas y ocultarlas.
// Se guarda por cuenta en este navegador (localStorage); más adelante puede ir al espacio de trabajo.

// id, nombre que ve la persona, módulo del que depende (null = siempre), solo administradores.
export const HOME_BLOCKS = [
  { id: 'miDia', label: 'Mi día', module: 'tasks' },
  { id: 'plan', label: 'Plan de hoy', module: 'tasks' },
  { id: 'metricas', label: 'Números de la semana', module: 'sales' },
  { id: 'atender', label: 'Qué atender hoy', module: 'mejoras', admin: true },
  { id: 'atrasados', label: 'Clientes que se pasaron de su frecuencia', module: 'prospecting' },
  { id: 'alertas', label: 'Radares (leads, cotizaciones, clientes quietos)', module: 'clients' },
  { id: 'semana', label: 'Resumen de la semana', module: 'sales' },
  { id: 'automatico', label: 'Lo automático', module: 'tasks' },
  { id: 'logistica', label: 'Logística de hoy', module: 'entregas' },
  { id: 'pausa', label: 'Pausar lo automático', module: 'settings', admin: true },
  { id: 'conexiones', label: 'Actualizaciones automáticas', module: 'settings', admin: true },
];

export const HOME_LAYOUT_KEY = 'poliplast-app-home-layout';

export function normalizeLayout(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const known = new Set(HOME_BLOCKS.map((block) => block.id));
  const order = (Array.isArray(value.order) ? value.order : []).filter((id) => known.has(id));
  for (const block of HOME_BLOCKS) if (!order.includes(block.id)) order.push(block.id);
  const hidden = (Array.isArray(value.hidden) ? value.hidden : []).filter((id) => known.has(id));
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}

// Tarjetas que esta persona puede tener (según sus módulos), en su orden. `allows(module)` decide los módulos.
export function availableBlocks(layout, allows = () => true, isAdmin = false) {
  const { order } = normalizeLayout(layout);
  return order
    .map((id) => HOME_BLOCKS.find((block) => block.id === id))
    .filter((block) => block && (!block.admin || isAdmin) && (!block.module || allows(block.module)));
}

export function visibleBlockIds(layout, allows, isAdmin) {
  const { hidden } = normalizeLayout(layout);
  return availableBlocks(layout, allows, isAdmin).map((block) => block.id).filter((id) => !hidden.includes(id));
}

// Mueve una tarjeta un lugar entre las que la persona ve (las de otros módulos no cuentan).
export function moveBlock(layout, id, direction, allows, isAdmin) {
  const current = normalizeLayout(layout);
  const mine = availableBlocks(current, allows, isAdmin).map((block) => block.id);
  const index = mine.indexOf(id);
  const target = index + (direction < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= mine.length) return current;
  const other = mine[target];
  const order = [...current.order];
  const a = order.indexOf(id);
  const b = order.indexOf(other);
  [order[a], order[b]] = [order[b], order[a]];
  return { ...current, order };
}

export function toggleBlock(layout, id) {
  const current = normalizeLayout(layout);
  const hidden = current.hidden.includes(id) ? current.hidden.filter((item) => item !== id) : [...current.hidden, id];
  return { ...current, hidden };
}

export function loadLayout(email = '') {
  try { return normalizeLayout(JSON.parse(localStorage.getItem(`${HOME_LAYOUT_KEY}:${String(email).toLowerCase()}`))); } catch { return normalizeLayout(null); }
}

export function saveLayout(email = '', layout) {
  try { localStorage.setItem(`${HOME_LAYOUT_KEY}:${String(email).toLowerCase()}`, JSON.stringify(normalizeLayout(layout))); } catch { /* sin almacenamiento */ }
}
