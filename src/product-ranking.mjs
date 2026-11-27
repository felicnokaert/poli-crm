// Ranking de productos por ventas de Contabilium (27/11, Felipe: «ranking por rubro, subrubro y producto, último mes,
// 3 o 6 meses, con gráfico»). Lee los renglones de contabilium_items (FC y COT suman; NC y NCT restan: el signo ya viene
// en cada renglón). El rubro y subrubro salen de Contabilium si los trae el renglón; si no, de la familia/subfamilia del
// catálogo del cotizador por SKU; si no, «Sin rubro». Lógica pura, sin red.

export const PERIODS = [[1, 'Último mes'], [3, '3 meses'], [6, '6 meses']];
export const LEVELS = [['producto', 'Productos'], ['rubro', 'Rubros'], ['subrubro', 'Subrubros']];
export const MEASURES = [['neto', 'Facturado (sin IVA)'], ['unidades', 'Unidades']];
export const NO_RUBRO = 'Sin rubro';

const plain = (value = '') => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const code = (value = '') => String(value).trim().toUpperCase().replace(/\s+/g, '');
const titleCase = (value = '') => String(value).trim().replace(/\s+/g, ' ');

export function sinceDate(months, now = Date.now()) {
  return new Date(now - months * 30.5 * 86400000).toISOString().slice(0, 10);
}

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
export function rankItems(items = [], { months = 1, now = Date.now(), level = 'producto', measure = 'neto', company = '', rubro = '', subrubro = '', query = '', catalog = new Map() } = {}) {
  const since = sinceDate(months, now);
  const words = plain(query).split(/\s+/).filter(Boolean);
  const groups = new Map();
  const options = { companies: new Set(), rubros: new Set(), subrubros: new Set() };
  let totalNet = 0;
  let totalUnits = 0;
  for (const item of items) {
    if (!item || !item.fecha || item.fecha < since) continue;
    const sign = Number(item.signo) || 0;
    if (!sign) continue;
    const info = classify(item, catalog);
    options.companies.add(item.company);
    if (company && item.company !== company) continue;
    options.rubros.add(info.rubro);
    if (rubro && info.rubro !== rubro) continue;
    options.subrubros.add(info.subrubro);
    if (subrubro && info.subrubro !== subrubro) continue;
    if (words.length && !words.every((word) => plain(`${info.sku} ${info.name} ${info.rubro} ${info.subrubro}`).includes(word))) continue;
    const net = sign * (Number(item.neto) || 0);
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
    options: { companies: sorted(options.companies), rubros: sorted(options.rubros), subrubros: sorted(options.subrubros) },
  };
}

// Ancho de cada barra (0-100) contra el mayor valor positivo mostrado.
export function barWidths(rows = [], measure = 'neto') {
  const values = rows.map((row) => (measure === 'unidades' ? row.units : row.net));
  const max = Math.max(0, ...values);
  return values.map((value) => (max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * 1000) / 10) : 0));
}

export function rankingCsv(rows = [], level = 'producto') {
  const head = level === 'producto' ? ['Puesto', 'SKU', 'Producto', 'Rubro', 'Subrubro', 'Unidades', 'Facturado sin IVA'] : ['Puesto', level === 'rubro' ? 'Rubro' : 'Subrubro', 'Unidades', 'Facturado sin IVA'];
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) => (level === 'producto'
    ? [row.rank, row.sku, row.label, row.rubro, row.subrubro, row.units, row.net]
    : [row.rank, row.label, row.units, row.net]).map(esc).join(';'));
  return [head.map(esc).join(';'), ...lines].join('\n');
}
