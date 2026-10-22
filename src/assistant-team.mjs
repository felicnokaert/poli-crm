// Lo que sabe el equipo (22/10, Felipe: "hay que aprender mucho más de los comerciales" y "buenísimo lo de
// derivar"). Tres cosas, todas en el navegador y sin costo:
// 1) teamNotes: lo que se anotó en el Historial, en las notas de los clientes y en los prospectos sobre lo
//    que se pregunta (un producto, una objeción), para que la IA responda con la experiencia del equipo.
// 2) routeFor / routesContext: a quién derivar según el tema.
// 3) prospectLearning: qué responde mejor en la Cola del día (versión del mensaje, familia, zona) y por qué
//    nos rechazan.
import { plain } from './knowledge-search.mjs';
import { REJECTION_REASONS } from './prospect-model.mjs';

// ---- 2) A quién derivar ----
export const ROUTES = [
  { who: 'Juan', why: 'máquinas, sistemas de poliuretano y repuestos (las máquinas también las ofrece David; si se vende una, capacitación con Adrián)', match: /\b(maquin\w*|equipos?|reactor\w*|proporcionador\w*|repuestos?|graco|purmac|poliurea|mantenimiento|service|sistemas? de poliuretano)\b/ },
  { who: 'Ezequiel', why: 'Resinplast (resinas poliéster, fibra, gel coat) e Imperpur (impermeabilizantes)', match: /\b(resinplast|imperpur|fibra\w*|roving|gel ?coat|poliester|laminad\w*|piscinas?|nautic\w*|membranas?|impermeabiliz\w*)\b/ },
  { who: 'Brenda', why: 'Poliplast, e-commerce y consultas de tiendas online (la apoya Yuliani)', match: /\b(tienda\w*|mercado ?libre|envios?|pedidos? online|e-?commerce|shopify|publicaci\w*)\b/ },
  { who: 'Yuliani', why: 'jefa de ventas: condiciones, precios especiales, distribuidores y clientes grandes', match: /\b(descuentos?|condiciones|cuenta corriente|precios? especial\w*|mayorista\w*|distribuidor\w*|lista de precios|reventa)\b/ },
];

export function routeFor(query = '', { max = 2 } = {}) {
  const text = plain(query);
  return ROUTES.filter((route) => route.match.test(text)).slice(0, max);
}

export function routesContext() {
  return ['A QUIÉN DERIVAR (si falta el dato o hace falta una persona, decí a quién consultar y ofrecé crear la tarea):', ...ROUTES.map((route) => `- ${route.who}: ${route.why}`)].join('\n');
}

// ---- 1) Lo que anotó el equipo ----
const STOP = new Set(['que', 'para', 'con', 'los', 'las', 'una', 'uno', 'por', 'del', 'como', 'cual', 'cuales', 'sus', 'este', 'esta', 'hay', 'tiene', 'tengo', 'tenemos', 'hoy', 'mis', 'cuanto', 'cuanta', 'cuantos', 'cuando', 'donde', 'quien', 'sirve', 'puedo', 'puede', 'hace', 'hacer', 'sobre', 'todo', 'toda', 'dame', 'decime', 'contame', 'necesito', 'quiero', 'saber', 'les', 'nos', 'ese', 'esa', 'eso', 'son', 'era', 'mas', 'menos', 'bien', 'muy', 'cliente', 'clientes', 'dicen', 'dijeron', 'equipo', 'comerciales', 'anotaron', 'experiencia', 'responder', 'responde', 'respondemos', 'conviene', 'mejor']);
const termsOf = (query) => [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !STOP.has(word)))].slice(0, 5);
const day = (value) => String(value || '').slice(0, 10).split('-').reverse().join('/');
const alive = (row) => row && !row.deleted && !row.deletedAt;

export function teamNotes(query, { interactions = [], clients = [], prospects = [] } = {}, { max = 6 } = {}) {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);
  const hits = (text) => terms.filter((term) => plain(text).includes(term)).length;
  const found = [];
  for (const row of interactions.filter(alive)) {
    const text = [row.summary, row.need, row.objection, row.nextAction].filter(Boolean).join(' · ');
    const score = hits(text);
    if (score >= need) found.push({ score, date: String(row.createdAt || row.date || ''), line: `${day(row.createdAt || row.date)} · ${row.company || 'sin empresa'}${row.channel ? ` (${row.channel})` : ''}: ${text.replace(/\s+/g, ' ').slice(0, 260)}` });
  }
  for (const client of clients.filter(alive)) {
    for (const note of String(client.notes || '').split(/\n+/)) {
      const score = hits(note);
      if (note.trim() && score >= need) found.push({ score, date: String(client.updatedAt || ''), line: `Nota en ${client.company}: ${note.trim().slice(0, 260)}` });
    }
  }
  for (const prospect of prospects.filter(alive)) {
    const text = [prospect.notes, prospect.outcome].filter(Boolean).join(' · ');
    const score = hits(`${text} ${prospect.family || ''}`);
    if (prospect.notes && score >= need) found.push({ score, date: String(prospect.updatedAt || ''), line: `Prospecto ${prospect.company}${prospect.family ? ` (${prospect.family})` : ''}: ${text.slice(0, 220)}` });
  }
  return found.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, max).map((entry) => entry.line);
}

export function teamNotesContext(lines = []) {
  if (!lines.length) return '';
  return ['Lo que anotó el equipo sobre esto (Historial, notas de clientes y prospectos: es experiencia real, usala):', ...lines.map((line) => `- ${line}`)].join('\n');
}

// ---- 3) Qué aprendimos en la Cola del día ----
const INTEREST = /con inter[eé]s|pidi[oó] cotizaci|respondi[oó], sigue/i;
const rate = (group) => (group.contacted ? Math.round((group.interested / group.contacted) * 100) : 0);

function bump(map, key, interested) {
  if (!key) return;
  const group = map.get(key) || { key, contacted: 0, interested: 0 };
  group.contacted += 1;
  if (interested) group.interested += 1;
  map.set(key, group);
}

export function prospectLearning({ prospects = [], clients = [] } = {}) {
  const byVariant = new Map();
  const byFamily = new Map();
  const byZone = new Map();
  const byQueue = new Map();
  const reasons = new Map();
  let contacted = 0;
  let interested = 0;
  for (const prospect of prospects.filter(alive)) {
    const history = Array.isArray(prospect.history) ? prospect.history : [];
    if (!history.length) continue;
    const first = history[0];
    const yes = history.some((entry) => INTEREST.test(`${entry.state} ${entry.outcome}`));
    contacted += 1;
    if (yes) interested += 1;
    bump(byVariant, `Versión ${first.variant || '?'}`, yes);
    bump(byFamily, first.family || prospect.family || 'Sin familia', yes);
    bump(byZone, first.zone || prospect.zone ? `Zona ${first.zone || prospect.zone}` : 'Sin zona', yes);
    const last = history[history.length - 1];
    if (!yes && REJECTION_REASONS.includes(last.outcome)) reasons.set(last.outcome, (reasons.get(last.outcome) || 0) + 1);
  }
  for (const client of clients.filter(alive)) {
    for (const entry of Array.isArray(client.contactLog) ? client.contactLog : []) {
      const yes = INTEREST.test(entry.outcome || '');
      bump(byQueue, entry.queue === 'cotizaron' ? 'Cotizaron y no compraron' : entry.queue === 'reactivar' ? 'Reactivar' : entry.queue || 'Otra', yes);
      if (!yes && REJECTION_REASONS.includes(entry.outcome)) reasons.set(entry.outcome, (reasons.get(entry.outcome) || 0) + 1);
    }
  }
  const sorted = (map) => [...map.values()].map((group) => ({ ...group, rate: rate(group) })).sort((a, b) => b.contacted - a.contacted);
  return {
    contacted,
    interested,
    rate: contacted ? Math.round((interested / contacted) * 100) : 0,
    byVariant: sorted(byVariant),
    byFamily: sorted(byFamily),
    byZone: sorted(byZone),
    byQueue: sorted(byQueue),
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

export const asksLearning = (query) => /\b(funciona\w*|rechaz\w*|por que no (compran|responden)|motivos?|aprendi\w*|que version|que mensaje|tasa|conversion|cuantos respond\w*)\b/.test(plain(query));

export function learningContext(stats) {
  if (!stats || (!stats.contacted && !stats.byQueue.length)) return '';
  const groups = (list) => list.slice(0, 6).map((group) => `${group.key}: ${group.interested} de ${group.contacted} (${group.rate} %)`).join(' · ');
  return [
    `Resultados de la Cola del día (prospectos contactados ${stats.contacted}, con interés ${stats.interested}, ${stats.rate} %):`,
    stats.byVariant.length && `- Por versión del mensaje: ${groups(stats.byVariant)}`,
    stats.byFamily.length && `- Por familia: ${groups(stats.byFamily)}`,
    stats.byZone.length && `- Por zona: ${groups(stats.byZone)}`,
    stats.byQueue.length && `- Clientes por lista: ${groups(stats.byQueue)}`,
    stats.reasons.length && `- Motivos de rechazo: ${stats.reasons.map((row) => `${row.reason} ${row.count}`).join(' · ')}`,
  ].filter(Boolean).join('\n');
}
