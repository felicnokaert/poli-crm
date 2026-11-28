// Ranking de productos por ventas de Contabilium (27/11, Felipe: «ranking por rubro, subrubro y producto, último mes,
// 3 o 6 meses, con gráfico»). Lee los renglones de contabilium_items (FC y COT suman; NC y NCT restan: el signo ya viene
// en cada renglón). El rubro y subrubro salen de Contabilium si los trae el renglón; si no, de la familia/subfamilia del
// catálogo del cotizador por SKU; si no, «Sin rubro». Lógica pura, sin red.

// 28/11 (Felipe): 30, 90 y 180 días; el importe en dólares (cada venta en pesos dividida por el dólar del día en que se
// facturó: neto_usd, lo calcula el servidor al traer los renglones).
export const PERIODS = [[30, '30 días'], [90, '90 días'], [180, '6 meses']];
export const LEVELS = [['producto', 'Productos'], ['rubro', 'Rubros'], ['subrubro', 'Subrubros']];
export const MEASURES = [['usd', 'Facturado en USD (sin IVA)'], ['unidades', 'Unidades']];
// 28/11: venta directa o facturada desde Mercado Libre (canal del renglón; sin dato = directa).
export const CHANNELS = [['', 'Todo'], ['directo', 'Directo'], ['ml', 'Mercado Libre']];
const channelOf = (item) => (item.canal === 'ml' ? 'ml' : 'directo');
export const NO_RUBRO = 'Sin rubro';

const plain = (value = '') => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const code = (value = '') => String(value).trim().toUpperCase().replace(/\s+/g, '');
const titleCase = (value = '') => String(value).trim().replace(/\s+/g, ' ');

export function sinceDate(days, now = Date.now()) {
  return new Date(now - days * 86400000).toISOString().slice(0, 10);
}
// Importe en dólares del renglón (null si todavía no se calculó).
export const usdOf = (item = {}) => (item.neto_usd == null || item.neto_usd === '' ? null : Number(item.neto_usd));

// catalog: [{ sku, name, family, subfamily }] → Map por SKU.
export function catalogIndex(catalog = []) {
  const map = new Map();
  for (const row of catalog) if (row?.sku) map.set(code(row.sku), row);
  return map;
}

export function classify(item = {}, catalog = new Map()) {
  const sku = code(item.codigo || '');
  const known = sku ? catalog.get(sku) : null;
  const rubro = titleCase(item.rubro || known?.family || '') || NO_RUBRO;
  const subrubro = titleCase(item.subrubro || known?.subfamily || '') || (rubro === NO_RUBRO ? NO_RUBRO : `${rubro} (sin subrubro)`);
  const name = titleCase(known?.name || item.nombre || sku || 'Sin nombre');
  return { sku, name, rubro, subrubro, key: sku || `nombre:${plain(item.nombre || '')}` };
}

// Junta los renglones del período (y filtros) por el nivel pedido y ordena de mayor a menor por la medida.
export function rankItems(items = [], { days = 30, now = Date.now(), level = 'producto', measure = 'usd', channel = '', company = '', rubro = '', subrubro = '', query = '', catalog = new Map() } = {}) {
  const since = sinceDate(days, now);
  let noUsd = 0;
  const words = plain(query).split(/\s+/).filter(Boolean);
  const groups = new Map();
  const options = { companies: new Set(), rubros: new Set(), subrubros: new Set() };
  let totalNet = 0;
  let totalUnits = 0;
  for (const item of items) {
    if (!item || !item.fecha || item.fecha < since) continue;
    const sign = Number(item.signo) || 0;
    if (!sign) continue;
    if (channel && channelOf(item) !== channel) continue;
    const info = classify(item, catalog);
    options.companies.add(item.company);
    if (company && item.company !== company) continue;
    options.rubros.add(info.rubro);
    if (rubro && info.rubro !== rubro) continue;
    options.subrubros.add(info.subrubro);
    if (subrubro && info.subrubro !== subrubro) continue;
    if (words.length && !words.every((word) => plain(`${info.sku} ${info.name} ${info.rubro} ${info.subrubro}`).includes(word))) continue;
    const usd = usdOf(item);
    if (usd == null) noUsd += 1;
    const net = sign * (usd || 0);
    const units = sign * (Number(item.cantidad) || 0);
    totalNet += net;
    totalUnits += units;
    const key = level === 'rubro' ? info.rubro : level === 'subrubro' ? `${info.rubro}|${info.subrubro}` : info.key;
    const label = level === 'rubro' ? info.rubro : level === 'subrubro' ? info.subrubro : info.name;
    const group = groups.get(key) || { key, label, sku: level === 'producto' ? info.sku : '', rubro: info.rubro, subrubro: info.subrubro, net: 0, units: 0, lines: 0, credits: 0 };
    group.net += net;
    group.units += units;
    group.lines += 1;
    if (sign < 0) group.credits += 1;
    groups.set(key, group);
  }
  const value = (group) => (measure === 'unidades' ? group.units : group.net);
  const rows = [...groups.values()]
    .map((group) => ({ ...group, net: Math.round(group.net * 100) / 100, units: Math.round(group.units * 100) / 100 }))
    .sort((a, b) => value(b) - value(a) || a.label.localeCompare(b.label, 'es'));
  const total = measure === 'unidades' ? totalUnits : totalNet;
  rows.forEach((row, index) => { row.rank = index + 1; row.share = total > 0 ? value(row) / total : 0; });
  const sorted = (set) => [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  return {
    rows,
    totalNet: Math.round(totalNet * 100) / 100,
    totalUnits: Math.round(totalUnits * 100) / 100,
    noUsd,
    options: { companies: sorted(options.companies), rubros: sorted(options.rubros), subrubros: sorted(options.subrubros) },
  };
}

// Ancho de cada barra (0-100) contra el mayor valor positivo mostrado.
export function barWidths(rows = [], measure = 'usd') {
  const values = rows.map((row) => (measure === 'unidades' ? row.units : row.net));
  const max = Math.max(0, ...values);
  return values.map((value) => (max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * 1000) / 10) : 0));
}

export function rankingCsv(rows = [], level = 'producto') {
  const head = level === 'producto' ? ['Puesto', 'SKU', 'Producto', 'Rubro', 'Subrubro', 'Unidades', 'USD sin IVA'] : ['Puesto', level === 'rubro' ? 'Rubro' : 'Subrubro', 'Unidades', 'USD sin IVA'];
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) => (level === 'producto'
    ? [row.rank, row.sku, row.label, row.rubro, row.subrubro, row.units, row.net]
    : [row.rank, row.label, row.units, row.net]).map(esc).join(';'));
  return [head.map(esc).join(';'), ...lines].join('\n');
}

// Semanas de un producto (o rubro/subrubro) en el período: unidades y USD por semana (lunes), para el gráfico al entrar.
export function weeklySeries(items = [], { key = '', level = 'producto', days = 90, now = Date.now(), company = '', channel = '', catalog = new Map() } = {}) {
  const since = sinceDate(days, now);
  const monday = (date) => { const d = new Date(`${date}T12:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
  const weeks = new Map();
  for (let cursor = monday(since); cursor <= new Date(now).toISOString().slice(0, 10); ) {
    weeks.set(cursor, { week: cursor, usd: 0, units: 0 });
    const next = new Date(`${cursor}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 7); cursor = next.toISOString().slice(0, 10);
  }
  const byCompany = {};
  for (const item of items) {
    if (!item?.fecha || item.fecha < since) continue;
    const sign = Number(item.signo) || 0;
    if (!sign || (company && item.company !== company) || (channel && channelOf(item) !== channel)) continue;
    const info = classify(item, catalog);
    const itemKey = level === 'rubro' ? info.rubro : level === 'subrubro' ? `${info.rubro}|${info.subrubro}` : info.key;
    if (itemKey !== key) continue;
    const week = weeks.get(monday(item.fecha));
    if (!week) continue;
    const usd = sign * (usdOf(item) || 0);
    week.usd += usd;
    week.units += sign * (Number(item.cantidad) || 0);
    byCompany[item.company] = (byCompany[item.company] || 0) + usd;
  }
  const rows = [...weeks.values()].map((week) => ({ ...week, usd: Math.round(week.usd * 100) / 100, units: Math.round(week.units * 100) / 100 }));
  return { rows, byCompany: Object.entries(byCompany).map(([name, usd]) => ({ name, usd: Math.round(usd * 100) / 100 })).sort((a, b) => b.usd - a.usd) };
}
