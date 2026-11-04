// ¿Cuántas cotizaciones se cierran? (22/10, revisión: "cerrar cotización → factura"). Cruza cada COT de
// Contabilium con la primera factura (FC…) del mismo cliente y empresa dentro de los 60 días siguientes.
// Solo lectura, sin IA: usa los comprobantes que ya lee la Cola del día.
import { comprobanteAmount, cuitKey } from './customer-base.mjs';

export const CLOSE_WINDOW_DAYS = 60;
const DAY = 86400000;
const day = (value) => String(value || '').slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
// 23/10: se empareja por CUIT (de la ficha de Contabilium) además del id de cliente: el mismo cliente cargado dos veces
// en la misma empresa tiene dos ids pero un solo CUIT. Sin CUIT (ficha sin traer) se usa el id o el nombre, como antes.
const clientKeys = (row) => {
  const cuit = cuitKey(row.cuit);
  return [`${row.company}|${row.cliente_id || String(row.cliente || '').trim().toLowerCase()}`, ...(cuit ? [`${row.company}|${cuit}`] : [])];
};
// 24/10: el mismo CUIT también cruza ENTRE empresas del grupo (cotizó en POLIPLAST y compró en COMARG o FOAMFACTORY).
// Solo cuenta si no hubo factura en la misma empresa; se informa aparte (crossCompany) para no inflar el número sin avisar.
const groupKey = (row) => { const cuit = cuitKey(row.cuit); return cuit ? `grupo|${cuit}` : ''; };

export function quoteConversion(rows = [], { today, months = 12 } = {}) {
  const since = new Date(Date.parse(today) - months * 30.4 * DAY).toISOString().slice(0, 10);
  // Cada factura cierra UNA sola cotización (4/11): antes una factura cerraba todas las cotizaciones del cliente en 60 días (3 COT + 1 FC = 100 %).
  const invoices = new Map();
  let invoiceId = 0;
  const usedInvoices = new Set();
  for (const row of rows) {
    if (!/^FC/.test(row.tipo || '')) continue;
    invoiceId += 1;
    for (const key of [...clientKeys(row), groupKey(row)].filter(Boolean)) {
      if (!invoices.has(key)) invoices.set(key, []);
      invoices.get(key).push({ when: day(row.fecha), id: invoiceId });
    }
  }
  for (const list of invoices.values()) list.sort((a, b) => a.when.localeCompare(b.when));
  const quotes = rows.filter((row) => row.tipo === 'COT' && day(row.fecha) >= since && day(row.fecha) <= today).sort((a, b) => day(a.fecha).localeCompare(day(b.fecha)));
  const byCompany = new Map();
  const byMonth = new Map();
  const closedDays = [];
  let closed = 0;
  let crossCompany = 0;
  let pending = 0;
  let quotedAmount = 0;
  let closedAmount = 0;
  for (const quote of quotes) {
    const date = day(quote.fecha);
    const age = daysBetween(date, today);
    const within = (keys) => {
      const pick = keys.flatMap((key) => invoices.get(key) || []).filter((entry) => !usedInvoices.has(entry.id) && entry.when >= date && daysBetween(date, entry.when) <= CLOSE_WINDOW_DAYS).sort((a, b) => a.when.localeCompare(b.when))[0];
      if (!pick) return undefined;
      usedInvoices.add(pick.id);
      return pick.when;
    };
    const sameCompany = within(clientKeys(quote));
    const otherCompany = sameCompany ? undefined : within([groupKey(quote)].filter(Boolean));
    const invoice = sameCompany || otherCompany;
    if (otherCompany) crossCompany += 1;
    const amount = comprobanteAmount(quote);
    quotedAmount += amount;
    const state = invoice ? 'cerrada' : age <= CLOSE_WINDOW_DAYS ? 'en curso' : 'perdida';
    if (state === 'cerrada') { closed += 1; closedAmount += amount; closedDays.push(daysBetween(date, invoice)); }
    if (state === 'en curso') pending += 1;
    for (const [map, key] of [[byCompany, quote.company || '?'], [byMonth, date.slice(0, 7)]]) {
      const group = map.get(key) || { key, quotes: 0, closed: 0, pending: 0 };
      group.quotes += 1;
      if (state === 'cerrada') group.closed += 1;
      if (state === 'en curso') group.pending += 1;
      map.set(key, group);
    }
  }
  closedDays.sort((a, b) => a - b);
  const decided = quotes.length - pending;
  const rate = (group) => { const base = group.quotes - group.pending; return base ? Math.round((group.closed / base) * 100) : null; };
  return {
    quotes: quotes.length,
    closed,
    crossCompany,
    pending,
    lost: decided - closed,
    rate: decided ? Math.round((closed / decided) * 100) : null,
    medianDays: closedDays.length ? closedDays[Math.floor(closedDays.length / 2)] : null,
    quotedAmount: Math.round(quotedAmount),
    closedAmount: Math.round(closedAmount),
    byCompany: [...byCompany.values()].map((group) => ({ ...group, rate: rate(group) })).sort((a, b) => b.quotes - a.quotes),
    byMonth: [...byMonth.values()].map((group) => ({ ...group, rate: rate(group) })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}
