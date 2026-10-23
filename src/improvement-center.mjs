// Centro de mejoras (24/10, Felipe: "dejarlas limpias" a Mercado Libre y Shopify): junta en una sola lista lo que hay
// que arreglar en cada canal, con cuánto falta y cómo viene bajando día a día. Lógica pura: los datos salen de los
// espejos (ml_items, ml_item_health, shopify_*) y las fotos diarias de improvement_snapshots. No cambia nada afuera.
import { ML_ISSUES } from './ml-board.mjs';
import { lowQuality } from './ml-improve.mjs';
import { SHOPIFY_ISSUES, boardRows } from './shopify-board.mjs';

export const CHANNELS = { ml: 'Mercado Libre', shopify: 'Shopify' };

// Qué cuenta para el "% limpio" de cada canal (lo accionable); el resto se muestra pero no pesa en el puntaje.
const ML_CLEAN = new Set(['sin-clip', 'pocas-fotos', 'sin-descripcion', 'calidad-baja', 'sin-stock', 'calidad-ml', 'experiencia-compra']);
const SHOPIFY_CLEAN = new Set(['sin_descripcion', 'sin_seo', 'sin_foto', 'stock_cero', 'sin_sku', 'sku_repetido', 'sin_peso', 'precio_cero']);

const ML_WHY = {
  'sin-clip': 'Mercado Libre dice que los clips traen más visitas y ventas.',
  'pocas-fotos': 'Con menos de 3 fotos se vende menos y baja la calidad.',
  'sin-descripcion': 'Sin descripción pierde posicionamiento y genera preguntas.',
  'calidad-baja': 'Calidad de la publicación por debajo de lo que Mercado Libre espera.',
  'sin-stock': 'Se ve pero no se puede comprar.',
  'sin-ventas': 'Activa y nunca vendió: revisar título, precio o fotos.',
  'visitas-sin-ventas': 'Muchas visitas y nunca vendió: algo del precio o de la ficha frena la compra.',
  'calidad-ml': 'Nivel de calidad menor a Profesional según Mercado Libre.',
  'experiencia-compra': 'La experiencia de compra está en rojo, naranja o amarillo.',
};

const PX_BAD = new Set(['red', 'orange', 'yellow']);

// Entradas de Mercado Libre: sobre las publicaciones activas.
export function mlEntries(items = [], health = []) {
  const active = items.filter((item) => item.status === 'active');
  const byId = new Map(health.map((row) => [String(row.id), row]));
  const entries = ML_ISSUES.map(([key, label, test]) => ({ channel: 'ml', key, label, count: active.filter(test).length, total: active.length, why: ML_WHY[key] || '', clean: ML_CLEAN.has(key) }));
  const checked = active.filter((item) => byId.has(String(item.id)));
  if (checked.length) {
    entries.push({ channel: 'ml', key: 'calidad-ml', label: 'Calidad menor a Profesional', count: checked.filter((item) => lowQuality(byId.get(String(item.id)))).length, total: checked.length, why: ML_WHY['calidad-ml'], clean: true, partial: checked.length < active.length });
    entries.push({ channel: 'ml', key: 'experiencia-compra', label: 'Experiencia de compra con problemas', count: checked.filter((item) => PX_BAD.has(String(byId.get(String(item.id)).px_color || '').toLowerCase())).length, total: checked.length, why: ML_WHY['experiencia-compra'], clean: true, partial: checked.length < active.length });
  }
  const accionables = ML_ISSUES.filter(([key]) => ML_CLEAN.has(key)).map(([, , test]) => test);
  const sucia = (item) => {
    const h = byId.get(String(item.id));
    return accionables.some((test) => test(item)) || Boolean(h && (lowQuality(h) || PX_BAD.has(String(h.px_color || '').toLowerCase())));
  };
  return { entries, total: active.length, clean: active.filter((item) => !sucia(item)).length };
}

// Entradas de Shopify: sobre los productos que no están archivados.
export function shopifyEntries(products = [], variants = []) {
  const rows = boardRows(products, variants).filter((row) => row.product.status === 'ACTIVE');
  const entries = SHOPIFY_ISSUES.map(([key, label, why]) => ({ channel: 'shopify', key, label, count: rows.filter((row) => row.issues.includes(key)).length, total: rows.length, why, clean: SHOPIFY_CLEAN.has(key) }));
  return { entries, total: rows.length, clean: rows.filter((row) => !row.issues.some((key) => SHOPIFY_CLEAN.has(key))).length };
}

// Filas para guardar la foto de hoy (el puntaje va como "_limpio").
export function snapshotRows(day, ml, shopify) {
  const rows = [];
  for (const [channel, data] of [['ml', ml], ['shopify', shopify]]) {
    if (!data || !data.total) continue;
    for (const entry of data.entries) rows.push({ day, channel, issue: entry.key, count: entry.count, total: entry.total });
    rows.push({ day, channel, issue: '_limpio', count: data.clean, total: data.total });
  }
  return rows;
}

const DAY = 86400000;
const dayMs = (day) => Date.parse(String(day).slice(0, 10));

// Cuánto cambió un problema: contra la foto de hace 7 días o más (o la primera que haya).
export function trendOf(history = [], channel, issue, today, nowCount) {
  const list = history.filter((row) => row.channel === channel && row.issue === issue && String(row.day).slice(0, 10) < today).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  if (!list.length) return { delta: null, since: null, series: [nowCount] };
  const target = dayMs(today) - 7 * DAY;
  const base = [...list].reverse().find((row) => dayMs(row.day) <= target) || list[0];
  return { delta: nowCount - base.count, since: String(base.day).slice(0, 10), series: [...list.slice(-13).map((row) => row.count), nowCount] };
}

// Lista de trabajo: lo accionable primero y por cantidad; lo informativo al final.
export function workList(entries = []) {
  return [...entries].filter((entry) => entry.count > 0).sort((a, b) => Number(b.clean) - Number(a.clean) || b.count / Math.max(b.total, 1) - a.count / Math.max(a.total, 1) || b.count - a.count);
}

export const percentClean = (data) => (data && data.total ? Math.round((data.clean / data.total) * 100) : null);
