// Poliplast App (prueba, 25/11): Inicio adaptable. Cada tarjeta del Inicio depende de un módulo: si la persona (o el
// rol que se está mirando) no lo tiene, la tarjeta no aparece. Cada uno puede ordenar sus tarjetas y ocultarlas.
// Se guarda en el espacio de trabajo de cada cuenta (data.homeLayout): sigue a la persona en la compu y en el celular.

// id, nombre que ve la persona, módulo del que depende (null = siempre), solo administradores.
export const HOME_BLOCKS = [
  { id: 'miDia', label: 'Mi día', module: 'tasks', desc: 'Tu rutina y lo que marcaste para hoy.', words: 'rutina dia hoy agenda' },
  { id: 'plan', label: 'Plan de hoy', module: 'tasks', desc: 'Tareas vencidas, las de hoy y lo que conviene atender primero.', words: 'tareas pendientes vencidas plan hacer' },
  { id: 'metricas', label: 'Números de la semana', module: 'sales', desc: 'Contactos, contactos efectivos y propuestas contra tu meta.', words: 'numeros metas contactos propuestas semana metricas objetivos' },
  { id: 'atender', label: 'Qué atender hoy', module: 'mejoras', admin: true, desc: 'Alertas de Mercado Libre, Shopify y las actualizaciones.', words: 'alertas mercado libre shopify urgente atender' },
  { id: 'atrasados', label: 'Clientes que se pasaron de su frecuencia', module: 'prospecting', desc: 'Clientes que ya deberían haber vuelto a comprar.', words: 'clientes frecuencia atrasados recompra volver comprar facturacion' },
  { id: 'alertas', label: 'Radares (leads, cotizaciones, clientes quietos)', module: 'clients', desc: 'Leads sin respuesta, cotizaciones frías y clientes quietos.', words: 'radar leads cotizaciones frias clientes quietos seguimiento' },
  { id: 'semana', label: 'Resumen de la semana', module: 'sales', desc: 'Resumen para copiar y mandar por WhatsApp.', words: 'resumen semana informe reporte whatsapp' },
  { id: 'automatico', label: 'Lo automático', module: 'tasks', desc: 'Lo que la app hizo sola: tareas creadas y procesos.', words: 'automatico robot procesos solo' },
  { id: 'logistica', label: 'Logística de hoy', module: 'entregas', desc: 'Entregas, etiquetas y depósito del día.', words: 'logistica entregas etiquetas deposito expedicion envios stock' },
  { id: 'conexiones', label: 'Actualizaciones automáticas', module: 'settings', admin: true, desc: 'Si alguna conexión (ML, Shopify, Contabilium) falló.', words: 'conexiones actualizaciones cron errores contabilium shopify mercado libre' },
];

export const HOME_LAYOUT_KEY = 'poliplast-app-home-layout';

// 26/11 (Felipe: «el Inicio termina siendo extenso»): sin orden guardado, arranca corto. Lo que ya avisa la campanita
// (radares, lo automático, actualizaciones, resumen) queda oculto y se prende desde «Ordenar mi Inicio».
export const DEFAULT_HIDDEN = ['alertas', 'automatico', 'conexiones', 'semana', 'atrasados'];

export function normalizeLayout(raw) {
  const value = raw && typeof raw === 'object' ? raw : { hidden: DEFAULT_HIDDEN };
  const known = new Set(HOME_BLOCKS.map((block) => block.id));
  const order = (Array.isArray(value.order) ? value.order : []).filter((id) => known.has(id));
  for (const block of HOME_BLOCKS) if (!order.includes(block.id)) order.push(block.id);
  const hidden = (Array.isArray(value.hidden) ? value.hidden : []).filter((id) => known.has(id));
  return { order: [...new Set(order)], hidden: [...new Set(hidden)], ...(value.updatedAt ? { updatedAt: value.updatedAt } : {}) };
}

// Tarjetas que esta persona puede tener (según sus módulos), en su orden. `allows(module)` decide los módulos.
export function availableBlocks(layout, allows = () => true, isAdmin = false) {
  const { order } = normalizeLayout(layout);
  return order
    .map((id) => HOME_BLOCKS.find((block) => block.id === id))
    .filter((block) => block && (!block.admin || isAdmin) && (!block.module || allows(block.module)));
}

export function visibleBlockIds(layout, allows = () => true, isAdmin) {
  const { hidden } = normalizeLayout(layout);
  // Sin orden guardado: quien vende no arranca con la tarjeta de Logística (la tiene en el menú); depósito y expedición sí.
  if (!layout && allows('sales')) hidden.push('logistica');
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
  return { ...current, order, updatedAt: new Date().toISOString() };
}

export function toggleBlock(layout, id) {
  const current = normalizeLayout(layout);
  const hidden = current.hidden.includes(id) ? current.hidden.filter((item) => item !== id) : [...current.hidden, id];
  return { ...current, hidden, updatedAt: new Date().toISOString() };
}

export function loadLayout(email = '') {
  try { return normalizeLayout(JSON.parse(localStorage.getItem(`${HOME_LAYOUT_KEY}:${String(email).toLowerCase()}`))); } catch { return normalizeLayout(null); }
}

export function saveLayout(email = '', layout) {
  try { localStorage.setItem(`${HOME_LAYOUT_KEY}:${String(email).toLowerCase()}`, JSON.stringify(normalizeLayout(layout))); } catch { /* sin almacenamiento */ }
}

// 27/11 (Felipe: «Ordenar mi Inicio muy feo; que sea como widgets»): editar arrastrando, quitar con una X y agregar
// desde una galería. Todo trabaja sobre las tarjetas que la persona VE (las de otros módulos no cuentan).
const stamp = (layout) => ({ ...layout, updatedAt: new Date().toISOString() });

// Lo de fábrica, igual que sin orden guardado (quien vende arranca sin Logística).
export function factoryLayout(allows = () => true) {
  const hidden = [...DEFAULT_HIDDEN];
  if (allows('sales')) hidden.push('logistica');
  return stamp({ order: HOME_BLOCKS.map((block) => block.id), hidden });
}

// Normaliza y deja explícito lo de fábrica (así el borrador del editor parte de lo que se ve hoy).
export function editableLayout(layout, allows = () => true) {
  return layout ? normalizeLayout(layout) : normalizeLayout(factoryLayout(allows));
}

// Pone `id` antes o después de `targetId` (arrastrar y soltar).
export function reorderBlock(layout, id, targetId, place = 'before') {
  const current = normalizeLayout(layout);
  if (!id || !targetId || id === targetId) return current;
  const order = current.order.filter((item) => item !== id);
  const at = order.indexOf(targetId);
  if (at < 0) return current;
  order.splice(place === 'after' ? at + 1 : at, 0, id);
  return stamp({ ...current, order });
}

// Mueve una tarjeta un lugar entre las VISIBLES (teclado: flechas).
export function moveVisible(layout, id, direction, allows, isAdmin) {
  const ids = visibleBlockIds(normalizeLayout(layout), allows, isAdmin);
  const index = ids.indexOf(id);
  const target = ids[index + (direction < 0 ? -1 : 1)];
  if (index < 0 || !target) return normalizeLayout(layout);
  return reorderBlock(layout, id, target, direction < 0 ? 'before' : 'after');
}

export function hideBlock(layout, id) {
  const current = normalizeLayout(layout);
  return current.hidden.includes(id) ? current : stamp({ ...current, hidden: [...current.hidden, id] });
}

// Agregar desde la galería: aparece al final de lo que se ve.
export function addBlock(layout, id) {
  const current = normalizeLayout(layout);
  return stamp({ ...current, hidden: current.hidden.filter((item) => item !== id), order: [...current.order.filter((item) => item !== id), id] });
}

// Lo que se puede agregar: tarjetas permitidas que hoy están ocultas.
export function addableBlocks(layout, allows = () => true, isAdmin = false) {
  const visible = new Set(visibleBlockIds(normalizeLayout(layout), allows, isAdmin));
  return availableBlocks(layout, allows, isAdmin).filter((block) => !visible.has(block.id));
}

const STOP = new Set(['que', 'los', 'las', 'del', 'para', 'con', 'mis', 'por', 'una', 'uno', 'quiero', 'ver', 'tener', 'mostrar', 'inicio', 'algo', 'cosas', 'como', 'cuando', 'esta', 'este', 'hay', 'tengo']);
const plain = (text) => String(text || '').toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// «¿Qué querés ver en tu Inicio?»: sin IA, por palabras del nombre, la descripción y sinónimos.
export function suggestBlocks(query, blocks = HOME_BLOCKS) {
  const words = plain(query).split(/[^a-z0-9ñ]+/).filter((word) => word.length > 2 && !STOP.has(word));
  if (!words.length) return blocks;
  return blocks
    .map((block) => {
      const hay = plain(`${block.label} ${block.desc || ''} ${block.words || ''}`);
      const score = words.reduce((sum, word) => sum + (hay.includes(word) ? 1 : hay.includes(word.slice(0, -1)) ? 0.5 : 0), 0);
      return { block, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.block);
}
