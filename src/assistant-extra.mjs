// Más respuestas del asistente sin costo (21/10, Felipe: "si todo lo que tenemos de info no gasta nada,
// usemos todo"): competidores de una familia (Academia → Competencia) y cuándo compró un cliente
// (comprobantes copiados de Contabilium). Todo sale de la base: nada se inventa.
import { plain } from './knowledge-search.mjs';
import { comprobanteAmount } from './customer-base.mjs';

// ---- Competidores por familia ----
const RIVAL_ASK = /\b(competen\w*|competidor\w*|rivales?|quien(es)? (mas )?vende\w*|contra quien)\b/;
// Cómo nombra la gente cada familia de la ficha de competencia.
const FAMILY_WORDS = {
  poliuretano: ['poliuretano', 'pu', 'espuma', 'espumas', 'aislante', 'proyectado', 'pur'],
  poliurea: ['poliurea'],
  resinplast: ['resinplast', 'resina', 'resinas', 'epoxi', 'epoxy', 'poliester'],
  purmac: ['purmac', 'maquina', 'maquinas', 'equipo', 'equipos', 'proyectora', 'proyectoras'],
  penosil: ['penosil', 'sellador', 'selladores', 'silicona', 'adhesivo', 'adhesivos', 'easyspray'],
  carrozados: ['carrozado', 'carrozados', 'carroceria', 'carrocerias', 'camion', 'camiones', 'termico'],
  planchas: ['plancha', 'planchas', 'placa', 'placas', 'panel', 'paneles'],
  quimica: ['quimica', 'quimicos'],
};

export const asksRivals = (query) => RIVAL_ASK.test(plain(query));

export function rivalsFor(competitors = [], query) {
  if (!asksRivals(query)) return null;
  const words = plain(query).split(/[^a-z0-9]+/).filter(Boolean);
  const families = Object.entries(FAMILY_WORDS).filter(([, synonyms]) => synonyms.some((word) => words.includes(word))).map(([family]) => family);
  const list = competitors.filter((rival) => rival?.kind !== 'cliente')
    .filter((rival) => !families.length || (rival.families || []).some((family) => families.includes(plain(family))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  return { families, list };
}

// ---- Cuándo compró un cliente ----
const BUY_ASK = /\b(compr\w*|factur\w*|cotiz\w*|ultima compra|nos debe|saldo)\b/;
const BUY_FILLER = new Set(['cuando', 'compro', 'compraron', 'compra', 'compras', 'comprado', 'ultima', 'ultimo', 'vez', 'cliente', 'facturas', 'factura', 'facturamos', 'facturado', 'cotizacion', 'cotizaciones', 'cotizamos', 'nos', 'que', 'les', 'del', 'los', 'las', 'por', 'fue', 'hace', 'cuanto', 'cuantas', 'veces', 'empresa', 'saldo', 'debe', 'historial', 'para', 'con', 'una', 'sus', 'este', 'esta']);

export const asksPurchases = (query) => BUY_ASK.test(plain(query));

// Palabras del nombre del cliente: lo que queda sin las palabras de "compra".
export function purchaseNameWords(query) {
  if (!asksPurchases(query)) return [];
  return [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !BUY_FILLER.has(word) && !/^compr|^factur|^cotiz/.test(word)))].slice(0, 3);
}

const INVOICE = /^FC/;
const CREDIT = /^NC/;
const daysAgo = (date, today) => Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
const dmy = (date) => String(date || '').slice(0, 10).split('-').reverse().join('/');
const pesos = (value) => `$ ${Math.round(value).toLocaleString('es-AR')}`;

// Resumen por cliente: última compra, compras y facturado en 24 meses, última cotización y saldo.
export function purchaseSummary(rows = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  const byClient = new Map();
  for (const row of rows) {
    const name = String(row.cliente || '').trim();
    if (!name) continue;
    if (!byClient.has(name)) byClient.set(name, []);
    byClient.get(name).push(row);
  }
  const since = new Date(Date.parse(today) - 730 * 86400000).toISOString().slice(0, 10);
  return [...byClient.entries()].map(([name, list]) => {
    const sorted = [...list].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const invoices = sorted.filter((row) => INVOICE.test(row.tipo || ''));
    const recent = invoices.filter((row) => String(row.fecha) >= since);
    const credits = sorted.filter((row) => CREDIT.test(row.tipo || '') && String(row.fecha) >= since);
    const billed = recent.reduce((sum, row) => sum + comprobanteAmount(row), 0) - credits.reduce((sum, row) => sum + comprobanteAmount(row), 0);
    const quote = sorted.find((row) => row.tipo === 'COT');
    const balance = invoices.reduce((sum, row) => sum + (Number(row.saldo) || 0), 0);
    const companies = [...new Set(sorted.map((row) => row.company))];
    return { name, companies, last: invoices[0] || null, lastQuote: quote || null, purchases24: recent.length, billed24: billed, invoices: invoices.length, balance, recentRows: sorted.slice(0, 5) };
  }).sort((a, b) => String(b.last?.fecha || '').localeCompare(String(a.last?.fecha || '')));
}

export function purchaseLine(summary, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const parts = [];
  if (summary.last) parts.push(`Última compra: ${dmy(summary.last.fecha)} (hace ${daysAgo(summary.last.fecha, today)} días, ${summary.last.tipo} ${pesos(comprobanteAmount(summary.last))})`);
  else parts.push('Sin facturas en lo copiado de Contabilium');
  parts.push(`${summary.purchases24} compra${summary.purchases24 === 1 ? '' : 's'} en 24 meses${summary.purchases24 ? ` por ${pesos(summary.billed24)}` : ''}`);
  if (summary.lastQuote) parts.push(`última cotización ${dmy(summary.lastQuote.fecha)}`);
  if (summary.balance > 0) parts.push(`saldo pendiente ${pesos(summary.balance)}`);
  return parts.join(' · ');
}

// Para el contexto de la IA.
export function extraContext({ rivals = null, purchases = [], today } = {}) {
  const lines = [];
  if (rivals?.list?.length) lines.push(`Competidores cargados en Academia${rivals.families.length ? ` (familia: ${rivals.families.join(', ')})` : ''}:`, ...rivals.list.slice(0, 25).map((rival) => `- ${rival.name}${rival.families?.length ? ` [${rival.families.join(', ')}]` : ''}${rival.summary ? `: ${String(rival.summary).slice(0, 200)}` : ''}`));
  if (purchases.length) lines.push('Compras según los comprobantes copiados de Contabilium (montos tal como figuran ahí; el historial todavía se está completando):', ...purchases.slice(0, 5).map((summary) => `- ${summary.name} (${summary.companies.join(', ')}): ${purchaseLine(summary, { today })}`));
  return lines.join('\n');
}
