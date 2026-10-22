// Base limpia de clientes calculada desde los comprobantes de Contabilium (copia de solo lectura en
// contabilium_comprobantes). Para cada Empresa del CRM: última compra, cantidad de compras, estado
// (activo, dormido, inactivo), frecuencia, "cliente grande" y razones sociales vinculadas.
// No inventa nada: si no hay comprobantes que coincidan, la Empresa queda "sin compras registradas".
// Las facturas no traen renglones (productos), así que la familia principal no se calcula de acá:
// se sigue usando la familia que ya tiene la ficha.

// Tipos de comprobante (Contabilium): facturas = venta; notas de crédito restan; cotización no es venta.
const INVOICE = /^FC[A-Z]?$/;
const CREDIT = /^NC[A-Z]?$/;
const QUOTE = 'COT';

export const ACTIVE_DAYS = 90; // compró hace 90 días o menos
export const DORMANT_DAYS = 365; // entre 91 días y 1 año: dormido; más de 1 año: inactivo
export const BIG_CLIENT_SHARE = 0.1; // "cliente grande" = el 10 % que más facturó en los últimos 24 meses
export const RECURRENT_PURCHASES = 3; // recurrente = 3 compras o más en 24 meses

const LEGAL_FORMS = /\b(s\.?\s?a\.?\s?s?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?c\.?\s?i\.?\s?f?\.?|sociedad anonima|sociedad de responsabilidad limitada|y cia|e hijos|hnos|hermanos)\b/g;

// "ALBA FERNANDA ARRARAS" y "Arraras Alba Fernanda S.A." no se igualan solas: solo se unen nombres que, sin
// acentos, signos ni forma societaria, son iguales o tienen las mismas palabras en otro orden.
export function nameKey(value = '') {
  const text = String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(LEGAL_FORMS, ' ');
  return text.split(/\s+/).filter(Boolean).sort().join(' ');
}

// "39.025,52" → 39025.52. Un número normal pasa tal cual; lo ilegible es null.
export function parseArNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = /,/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function comprobanteAmount(row = {}) {
  const total = parseArNumber(row.total);
  if (total !== null) return total;
  return parseArNumber(row.neto ?? row.raw?.ImporteTotalNeto) ?? 0;
}

const day = (value) => String(value || '').slice(0, 10);

function daysBetween(from, to) {
  return Math.round((Date.parse(`${day(to)}T12:00:00Z`) - Date.parse(`${day(from)}T12:00:00Z`)) / 86400000);
}

function monthsAgo(date, months) {
  const d = new Date(`${day(date)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

// Mediana de los días entre compras (más estable que el promedio). Menos de 2 compras: sin dato.
function medianGap(dates) {
  const sorted = [...dates].sort();
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = daysBetween(sorted[index - 1], sorted[index]);
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

export function customerStatus(daysSince) {
  if (daysSince === null || daysSince === undefined) return 'sin compras registradas';
  if (daysSince <= ACTIVE_DAYS) return 'activo';
  if (daysSince <= DORMANT_DAYS) return 'dormido';
  return 'inactivo';
}

// Cobertura de la copia: de qué fecha a qué fecha hay comprobantes por empresa de Contabilium.
export function coverageByCompany(rows = []) {
  const out = {};
  for (const row of rows) {
    const date = day(row.fecha);
    if (!date) continue;
    const cur = out[row.company] || { from: date, to: date, count: 0 };
    out[row.company] = { from: date < cur.from ? date : cur.from, to: date > cur.to ? date : cur.to, count: cur.count + 1 };
  }
  return out;
}

// 22/10: además del nombre, el CUIT y el teléfono (últimos 8 dígitos) de la ficha de Contabilium.
const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');
export const cuitKey = (value) => { const doc = onlyDigits(value); return doc.length >= 7 ? `cuit:${doc}` : ''; };
export const phoneKey = (value) => { const tel = onlyDigits(value); return tel.length >= 8 ? `tel:${tel.slice(-8)}` : ''; };

function clientKeys(client = {}) {
  const names = [client.company, client.legalName, ...(Array.isArray(client.legalNames) ? client.legalNames : [])].map(nameKey);
  return [...new Set([...names, cuitKey(client.cuit), phoneKey(client.phone), phoneKey(client.whatsapp)].filter(Boolean))];
}

// rows: filas de contabilium_comprobantes ({company, tipo, fecha, cliente, total, neto?}).
// Devuelve un Map clientId → ficha calculada, más `quotes` (cotizaciones por cliente).
export function buildCustomerBase(rows = [], clients = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  const byKey = new Map();
  for (const client of clients) for (const key of clientKeys(client)) if (!byKey.has(key)) byKey.set(key, client.id);

  const acc = new Map();
  const unmatched = new Set();
  const touch = (clientId) => {
    if (!acc.has(clientId)) acc.set(clientId, { sales: [], credits: 0, names: new Set(), quotes: [] });
    return acc.get(clientId);
  };
  for (const row of rows) {
    const tipo = String(row.tipo || '').toUpperCase();
    const isSale = INVOICE.test(tipo);
    const isCredit = CREDIT.test(tipo);
    const isQuote = tipo === QUOTE;
    if (!isSale && !isCredit && !isQuote) continue;
    const clientId = byKey.get(nameKey(row.cliente)) || byKey.get(cuitKey(row.cuit)) || byKey.get(phoneKey(row.tel));
    if (!clientId) { if (isSale) unmatched.add(row.cliente); continue; }
    const entry = touch(clientId);
    entry.names.add(String(row.cliente || '').trim());
    const date = day(row.fecha);
    if (!date) continue;
    if (isSale) entry.sales.push({ date, amount: comprobanteAmount(row), company: row.company });
    else if (isCredit) entry.credits += comprobanteAmount(row);
    else entry.quotes.push({ date, amount: comprobanteAmount(row), company: row.company });
  }

  const since24 = monthsAgo(today, 24);
  const result = new Map();
  for (const [clientId, entry] of acc) {
    const dates = entry.sales.map((sale) => sale.date).sort();
    const recent = entry.sales.filter((sale) => sale.date >= since24);
    const lastPurchase = dates.length ? dates[dates.length - 1] : '';
    const daysSince = lastPurchase ? daysBetween(lastPurchase, today) : null;
    const total24 = recent.reduce((sum, sale) => sum + sale.amount, 0);
    result.set(clientId, {
      clientId,
      razonesSociales: [...entry.names].filter(Boolean).sort(),
      purchaseCount: dates.length,
      purchases24: recent.length,
      firstPurchase: dates[0] || '',
      lastPurchase,
      daysSince,
      status: customerStatus(daysSince),
      frequencyDays: medianGap(recent.map((sale) => sale.date)),
      total24: Math.round(total24),
      companies: [...new Set(entry.sales.map((sale) => sale.company).filter(Boolean))].sort(),
      recurrent: recent.length >= RECURRENT_PURCHASES,
      big: false,
      quotes: entry.quotes.sort((a, b) => b.date.localeCompare(a.date)),
    });
  }
  // "Cliente grande": el 10 % que más facturó en 24 meses (al menos 1 cliente si hay 10 o menos con compras).
  const withSales = [...result.values()].filter((item) => item.total24 > 0).sort((a, b) => b.total24 - a.total24);
  const bigCount = Math.max(1, Math.ceil(withSales.length * BIG_CLIENT_SHARE));
  withSales.slice(0, withSales.length ? bigCount : 0).forEach((item) => { item.big = true; });
  return { byClient: result, unmatchedCount: unmatched.size };
}
