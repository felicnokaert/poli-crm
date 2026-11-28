// Facturación (28/11, Felipe: «lo que nos falta son las secciones de Administración»): comprobantes de Contabilium
// (copia de solo lectura en contabilium_comprobantes). Lógica pura para la pantalla src/Facturacion.jsx.
export const COMPANIES = [['POLIPLAST', 'Poliplast'], ['FOAMFACTORY', 'Foam Factory'], ['COMARG', 'Comarg'], ['POLIOCHO', 'Poliocho']];
export const companyLabel = (key) => (COMPANIES.find(([id]) => id === key)?.[1] || key || '—');

// Grupos de tipos de comprobante (FCA, FCB, FCE, FCM = facturas; NC* notas de crédito; ND* notas de débito; COT).
export const KINDS = [['facturas', 'Facturas', 'FC'], ['creditos', 'Notas de crédito', 'NC'], ['debitos', 'Notas de débito', 'ND'], ['cotizaciones', 'Cotizaciones', 'COT']];
export const kindPrefix = (kind) => KINDS.find(([id]) => id === kind)?.[2] || '';
export const kindOf = (tipo = '') => {
  const t = String(tipo).toUpperCase();
  return t.startsWith('COT') ? 'cotizaciones' : t.startsWith('NC') ? 'creditos' : t.startsWith('ND') ? 'debitos' : t.startsWith('FC') ? 'facturas' : 'otros';
};

// Monedas en dólares de cada empresa (IDMoneda de Contabilium); COMARG solo factura en pesos.
export const USD_MONEDAS = new Set(['12756', '14654', '57213']);
export const currencyOf = (moneda) => (USD_MONEDAS.has(String(moneda ?? '')) ? 'USD' : 'ARS');
export function money(value, currency = 'ARS') {
  const n = Number(value) || 0;
  return currency === 'USD'
    ? `USD ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$ ${Math.round(n).toLocaleString('es-AR')}`;
}

// Las notas de crédito restan.
export const signed = (row) => (kindOf(row.tipo) === 'creditos' ? -1 : 1) * (Number(row.total) || 0);

// Rango de fechas por período rápido (días hacia atrás desde hoy, formato AAAA-MM-DD).
export function periodRange(days, today = new Date()) {
  if (!days) return { from: '', to: '' };
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - Number(days) + 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

// Saldos pendientes por cliente: facturas y notas de débito con saldo > 0, agrupadas por empresa + cliente y moneda.
export function balancesByClient(rows = [], today = new Date()) {
  const groups = new Map();
  for (const row of rows) {
    const saldo = Number(row.saldo) || 0;
    if (saldo <= 0.5) continue;
    const kind = kindOf(row.tipo);
    if (kind !== 'facturas' && kind !== 'debitos') continue;
    const currency = currencyOf(row.moneda);
    const key = `${row.company}|${row.cliente_id || row.cliente}|${currency}`;
    const group = groups.get(key) || { key, company: row.company, cliente: row.cliente || 'Sin nombre', currency, saldo: 0, count: 0, oldest: '' };
    group.saldo += saldo;
    group.count += 1;
    if (row.fecha && (!group.oldest || row.fecha < group.oldest)) group.oldest = row.fecha;
    groups.set(key, group);
  }
  const ms = 86400000;
  return [...groups.values()].map((group) => ({ ...group, days: group.oldest ? Math.max(0, Math.floor((today - new Date(`${group.oldest}T12:00:00`)) / ms)) : 0 }));
}

export const AGING = [['', 'Todas'], ['30', 'Hasta 30 días'], ['90', '31 a 90 días'], ['mas', 'Más de 90 días']];
export function agingMatches(days, filter) {
  if (!filter) return true;
  if (filter === '30') return days <= 30;
  if (filter === '90') return days > 30 && days <= 90;
  return days > 90;
}
