// El asistente lee tu espacio de trabajo (21/10, Felipe: "sumá tareas, ventas, historial y prospectos"):
// tareas pendientes, ventas cargadas (y la memoria de precios), lo hablado con cada empresa (Historial) y
// los prospectos. Todo se resuelve en el navegador, sin IA ni costo; lo encontrado también va a la IA.
import { plain } from './knowledge-search.mjs';
import { buildPriceMemory, findPriceMatches, ivaLabel } from './price-memory.mjs';

const ASK = {
  tasks: /\b(tareas?|pendientes?|agenda|vencid\w*|que tengo|para hoy|hoy tengo|que hago|recordatorios?|seguimientos?)\b/,
  sales: /\b(vend\w*|ventas?|precios?|a cuanto|cuanto (sale|salio|cobramos|le cobramos)|facturamos|ultimo precio)\b/,
  history: /\b(hablamos|hable|historial|conversaci\w*|charla\w*|que (nos )?dijo|ultima vez|ultimo contacto|interacci\w*)\b/,
  prospects: /\b(prospect\w*|leads?|clientes? nuevos?|para captar)\b/,
};
const FILLER = new Set(['que', 'para', 'con', 'los', 'las', 'una', 'uno', 'por', 'del', 'como', 'cual', 'cuales', 'sus', 'este', 'esta', 'hay', 'tiene', 'tengo', 'tenemos', 'hoy', 'mis', 'mi', 'cuanto', 'cuando', 'donde', 'quien', 'vendimos', 'vendemos', 'vendi', 'vendio', 'venta', 'ventas', 'precio', 'precios', 'ultimo', 'ultima', 'ultimos', 'vez', 'tarea', 'tareas', 'pendiente', 'pendientes', 'hablamos', 'hable', 'historial', 'conversacion', 'prospecto', 'prospectos', 'cliente', 'clientes', 'empresa', 'sale', 'salio', 'cobramos', 'facturamos', 'dijo', 'nos', 'les', 'le', 'agenda', 'vencidas', 'vencida', 'semana', 'nuevos', 'nuevo', 'hacer', 'hago', 'contacto', 'interaccion', 'seguimiento', 'seguimientos', 'algo', 'todo', 'todos', 'fue', 'qué', 'leads', 'captar']);

const words = (query) => [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !FILLER.has(word)))];
const matchesName = (name, terms) => terms.length > 0 && terms.every((term) => plain(name).includes(term));
const dmy = (date) => (/^\d{4}-\d{2}-\d{2}/.test(String(date || '')) ? String(date).slice(0, 10).split('-').reverse().join('/') : String(date || ''));
const money = (value, currency = 'ARS') => `${currency === 'USD' ? 'US$' : '$'} ${Math.round(Number(value) || 0).toLocaleString('es-AR')}`;

function saleTotal(sale) {
  const net = Number(sale.netAmount ?? sale.amount);
  if (Number.isFinite(net) && net) return net;
  return (sale.items || []).reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1), 0);
}

export function workspaceAnswer(query, { tasks = [], sales = [], interactions = [], prospects = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const text = plain(query);
  const asked = Object.fromEntries(Object.entries(ASK).map(([key, pattern]) => [key, pattern.test(text)]));
  const terms = words(query);
  const blocks = [];
  const alive = (row) => row && !row.deleted && !row.deletedAt;

  // Empresas nombradas en la pregunta (en cualquiera de las cuatro fuentes).
  const named = (name) => matchesName(name, terms);
  const anyNamed = terms.length > 0 && [
    ...tasks.map((task) => task.company), ...sales.map((sale) => sale.customer || sale.company),
    ...interactions.map((row) => row.company), ...prospects.map((row) => row.company),
  ].some((name) => name && named(name));

  // Tareas
  if (asked.tasks || (anyNamed && tasks.some((task) => named(task.company || '')))) {
    const open = tasks.filter(alive).filter((task) => !task.done)
      .filter((task) => !anyNamed || named(`${task.company || ''} ${task.title || ''}`))
      .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    const week = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
    const late = open.filter((task) => task.dueDate && task.dueDate < today);
    const now = open.filter((task) => task.dueDate === today);
    const soon = open.filter((task) => task.dueDate && task.dueDate > today && task.dueDate <= week);
    const lines = [
      ...late.slice(0, 6).map((task) => `Vencida (${dmy(task.dueDate)}): ${task.title}${task.company ? ` · ${task.company}` : ''}`),
      ...now.slice(0, 8).map((task) => `Hoy: ${task.title}${task.company ? ` · ${task.company}` : ''}`),
      ...soon.slice(0, 6).map((task) => `${dmy(task.dueDate)}: ${task.title}${task.company ? ` · ${task.company}` : ''}`),
    ];
    if (!lines.length && anyNamed) lines.push(...open.slice(0, 5).map((task) => `${task.dueDate ? dmy(task.dueDate) : 'Sin fecha'}: ${task.title}`));
    blocks.push({ key: 'tareas', label: `Tareas pendientes · ${late.length} vencidas, ${now.length} para hoy, ${soon.length} esta semana`, lines: lines.length ? lines : ['No hay tareas pendientes con eso.'] });
  }

  // Ventas: a una empresa y a cuánto vendimos un producto.
  if (asked.sales || (anyNamed && sales.some((sale) => named(sale.customer || sale.company || '')))) {
    const lines = [];
    const toClient = sales.filter(alive).filter((sale) => anyNamed && named(sale.customer || sale.company || ''))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (toClient.length) {
      lines.push(`${toClient[0].customer || toClient[0].company}: ${toClient.length} venta${toClient.length === 1 ? '' : 's'} cargada${toClient.length === 1 ? '' : 's'}; la última el ${dmy(toClient[0].date)} por ${money(saleTotal(toClient[0]), toClient[0].currency)} + IVA.`);
      for (const sale of toClient.slice(0, 4)) lines.push(`${dmy(sale.date)} · ${money(saleTotal(sale), sale.currency)} + IVA${(sale.items || []).length ? ` · ${(sale.items || []).slice(0, 3).map((item) => item.description).filter(Boolean).join(', ')}` : ''}`);
    }
    if (terms.length && !toClient.length) {
      const prices = findPriceMatches(buildPriceMemory(sales.filter(alive)), terms.join(' '), 5);
      for (const entry of prices) lines.push(`${entry.description}: ${money(entry.unitPrice, entry.currency)} ${ivaLabel(entry)} el ${dmy(entry.date)}${entry.customer ? ` a ${entry.customer}` : ''}${entry.history.length > 1 ? ` (antes: ${entry.history.slice(1).map((old) => `${money(old.unitPrice, old.currency)} el ${dmy(old.date)}`).join('; ')})` : ''}`);
    }
    if (!terms.length) {
      const month = today.slice(0, 7);
      const thisMonth = sales.filter(alive).filter((sale) => String(sale.date).startsWith(month));
      lines.push(`Este mes: ${thisMonth.length} venta${thisMonth.length === 1 ? '' : 's'} cargada${thisMonth.length === 1 ? '' : 's'} por ${money(thisMonth.reduce((sum, sale) => sum + saleTotal(sale), 0))} + IVA.`);
    }
    if (lines.length) blocks.push({ key: 'ventas', label: 'Ventas cargadas en el CRM', lines });
  }

  // Historial: lo hablado con una empresa.
  if (asked.history || (anyNamed && interactions.some((row) => named(row.company || '')))) {
    const rows = interactions.filter(alive).filter((row) => !anyNamed || named(`${row.company || ''} ${row.contact || ''}`))
      .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
    const lines = rows.slice(0, 5).map((row) => `${dmy(String(row.createdAt || row.date || '').slice(0, 10))} · ${row.company || ''}${row.contact ? ` (${row.contact})` : ''}${row.channel ? ` por ${row.channel}` : ''}: ${String(row.summary || row.need || '').slice(0, 220)}${row.nextAction ? ` → próximo paso: ${row.nextAction}${row.nextDate ? ` (${dmy(row.nextDate)})` : ''}` : ''}`);
    if (lines.length || asked.history) blocks.push({ key: 'historial', label: 'Historial de conversaciones', lines: lines.length ? lines : ['No hay conversaciones guardadas con eso.'] });
  }

  // Prospectos
  if (asked.prospects || (anyNamed && prospects.some((row) => named(row.company || '')))) {
    const rows = prospects.filter(alive).filter((row) => !anyNamed || named(`${row.company || ''} ${row.city || ''} ${row.family || ''} ${row.rubro || ''}`));
    const lines = rows.slice(0, 8).map((row) => [row.company, row.state && `estado: ${row.state}`, row.family, row.city, row.zone && `zona ${row.zone}`, row.phone && `tel ${row.phone}`, row.email].filter(Boolean).join(' · '));
    blocks.push({ key: 'prospectos', label: `Prospectos${anyNamed ? '' : ` · ${rows.length} en total`}`, lines: lines.length ? lines : ['No hay prospectos con eso.'] });
  }
  return blocks;
}

export function workspaceContext(blocks = []) {
  return blocks.map((block) => [`${block.label}:`, ...block.lines.map((line) => `- ${line}`)].join('\n')).join('\n');
}
