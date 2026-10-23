// Las tres colas de trabajo del día, con el mensaje listo para copiar (el CRM nunca envía):
//   1. Reactivar: clientes recurrentes o grandes que dejaron de comprar.
//   2. Cotizaron y no compraron: hay una cotización (Contabilium o marcada en la ficha) y ninguna factura después.
//   3. Prospectos nuevos con encaje y puntaje alto (la cola de Prospección, ya ordenada con esos datos).
// Todo es puro y testeado. Los mensajes no afirman nada que no esté en la ficha: sin precios, plazos ni promesas.
import { buildQueue } from './prospect-queue.mjs';

export const QUEUE_SIZE = 10;
export const COOLDOWN_DAYS = 14; // un cliente ya trabajado en una cola no vuelve a aparecer por 14 días
export const QUOTE_MIN_DAYS = 3; // antes de 3 días todavía es pronto para preguntar
export const QUOTE_MAX_DAYS = 90; // pasados 90 días ya es otra conversación: reactivar, no seguimiento
export const REACTIVATE_MAX_DAYS = 730;

const day = (value) => String(value || '').slice(0, 10);
// Fecha argentina (UTC-3) de un instante guardado en UTC: pasadas las 21:00 en Argentina el día UTC ya es el siguiente.
const arDay = (value) => (/T/.test(String(value || '')) ? new Date(Date.parse(value) - 3 * 3600 * 1000).toISOString().slice(0, 10) : day(value));
const daysBetween = (from, to) => Math.round((Date.parse(`${day(to)}T12:00:00Z`) - Date.parse(`${day(from)}T12:00:00Z`)) / 86400000);

export function firstName(client = {}) {
  const contact = String(client.contact || '').trim();
  if (!contact) return '';
  return contact.split(/[\s,;/]+/)[0].replace(/^./, (c) => c.toLocaleUpperCase('es-AR'));
}

// ¿Ya lo trabajamos en esta cola hace poco? (contactLog lo escribe la propia cola al anotar el resultado)
export function recentlyWorked(client = {}, queue, today, days = COOLDOWN_DAYS) {
  return (Array.isArray(client.contactLog) ? client.contactLog : []).some((entry) => entry.queue === queue && daysBetween(arDay(entry.at), today) <= days && daysBetween(arDay(entry.at), today) >= 0);
}

export function logClientContact(client = {}, { queue, outcome = '', user = '', now = new Date().toISOString() } = {}) {
  const log = [...(Array.isArray(client.contactLog) ? client.contactLog : []), { at: now, queue, outcome, user }].slice(-30);
  return { ...client, contactLog: log, lastContact: arDay(now), updatedAt: now };
}

function monthYear(date) {
  const [year, month] = day(date).split('-');
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${names[Number(month) - 1] || ''} de ${year}`.trim();
}

export function reactivationMessage(client = {}, info = {}, sender = '') {
  const who = sender || '[tu nombre]';
  const name = firstName(client) || client.company || 'equipo';
  const product = String(client.mainProduct || '').trim();
  const last = info.lastPurchase ? ` (la última fue en ${monthYear(info.lastPurchase)}${product ? `, ${product}` : ''})` : '';
  return `Hola ${name}, ¿cómo andan? Soy ${who} de Grupo Poliplast. Hace un tiempo trabajaron con nosotros${last} y quería saber cómo les fue y si están necesitando algo ahora. Si cambió lo que usan o lo que necesitan, contame y lo vemos.`;
}

export function quoteMessage(client = {}, quote = {}, sender = '') {
  const who = sender || '[tu nombre]';
  const name = firstName(client) || client.company || 'equipo';
  return `Hola ${name}, soy ${who} de Grupo Poliplast. Te escribo por la cotización que te pasamos el ${day(quote.date).split('-').reverse().join('/')}. ¿Pudiste verla? Si algo no cerró (precio, plazo, cantidad), decime qué y vemos cómo ajustarlo.`;
}

// Clientes que fueron buenos y dejaron de comprar: grandes primero, después recurrentes; entre iguales, el que más facturó.
// 22/10 (Felipe: "que no se base solamente en Contabilium, sino también en nuestra lista"): si el cliente no
// coincide con la facturación, se usa lo que dice su ficha (última compra y cantidad de compras de la cartera
// o de la importación POLIOCHO).
const crmIso = (value) => { const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim()); return match ? `${match[3]}-${match[2]}-${match[1]}` : (/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : ''); };
export function infoFromCrm(client = {}, today) {
  const last = [crmIso(client.lastPurchase), client.polio8?.invoiced !== false ? crmIso(client.polio8?.lastDate) : ''].filter(Boolean).sort().pop();
  if (!last) return null;
  const count = Number(client.polio8?.documents) || Number(client.totalPurchases) || 0;
  const daysSince = daysBetween(last, today);
  return { lastPurchase: last, daysSince, purchases24: count, purchaseCount: count, recurrent: count >= 3, big: false, total24: 0, quotes: [], status: daysSince <= 90 ? 'activo' : daysSince <= 365 ? 'dormido' : 'inactivo', fromCrm: true };
}

// Familias para filtrar la cola (las que tienen la cartera y los prospectos).
export function queueFamilies(clients = [], prospects = []) {
  return [...new Set([...clients.map((client) => client.family), ...prospects.map((prospect) => prospect.family)].map((value) => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}
const plainText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matchesFamily(record = {}, family = '') {
  if (!family) return true;
  return plainText([record.family, record.mainProduct, record.rubro, record.products].filter(Boolean).join(' ')).includes(plainText(family));
}

export function reactivationQueue({ clients = [], base = new Map(), today, limit = QUEUE_SIZE } = {}) {
  const items = [];
  for (const client of clients) {
    const info = base.get(client.id) || infoFromCrm(client, today);
    if (!info || !['dormido', 'inactivo'].includes(info.status)) continue;
    if (!(info.big || info.recurrent)) continue;
    if (info.daysSince > REACTIVATE_MAX_DAYS) continue;
    if (recentlyWorked(client, 'reactivar', today)) continue;
    const reason = [info.big && 'cliente grande', info.recurrent && `${info.purchases24} compras en 24 meses`].filter(Boolean).join(' · ');
    items.push({ client, info, reason: `${reason} · última compra hace ${info.daysSince} días`, rank: (info.big ? 2 : 0) + (info.recurrent ? 1 : 0) });
  }
  items.sort((a, b) => b.rank - a.rank || b.info.total24 - a.info.total24 || a.info.daysSince - b.info.daysSince);
  return items.slice(0, limit);
}

// Se pasaron de su frecuencia (22/10): clientes activos que compran seguido (3+ compras en 24 meses) y ya
// pasaron bastante de cuando suelen volver (al menos 15 días y la mitad de su frecuencia). Es plata que se escapa
// antes de que el cliente quede "dormido" (eso ya lo cubre Reactivar).
export function overdueQueue({ clients = [], base = new Map(), today, limit = QUEUE_SIZE } = {}) {
  const items = [];
  for (const client of clients) {
    const info = base.get(client.id);
    if (!info?.frequencyDays || info.status !== 'activo' || info.purchases24 < 3) continue;
    const late = info.daysSince - info.frequencyDays;
    if (late < Math.max(15, Math.round(info.frequencyDays / 2))) continue;
    if (recentlyWorked(client, 'atrasados', today)) continue;
    items.push({ client, info, late, reason: `compra cada ~${info.frequencyDays} días · la última hace ${info.daysSince} (${late} días más de lo habitual)${info.big ? ' · cliente grande' : ''}` });
  }
  items.sort((a, b) => Number(b.info.big) - Number(a.info.big) || b.info.total24 - a.info.total24 || b.late - a.late);
  return items.slice(0, limit);
}

export function overdueMessage(client = {}, info = {}, sender = '') {
  const who = sender || '[tu nombre]';
  const name = firstName(client) || client.company || 'equipo';
  const product = String(client.mainProduct || '').trim();
  return `Hola ${name}, ¿cómo va? Soy ${who} de Grupo Poliplast. Por lo general para esta época ya nos estaban pidiendo${product ? ` ${product}` : ''}: ¿cómo vienen de stock? Si necesitan, te paso precio actualizado y lo coordinamos.`;
}

// Cotizaron y no compraron: la cotización más reciente (Contabilium o la marca "Coticé hoy" de la ficha) sin factura posterior.
export function quotedQueue({ clients = [], base = new Map(), today, limit = QUEUE_SIZE } = {}) {
  const items = [];
  for (const client of clients) {
    const info = base.get(client.id);
    const dates = [...(info?.quotes || []).map((quote) => quote.date), client.lastQuotedAt && day(client.lastQuotedAt)].filter(Boolean).sort();
    const last = dates[dates.length - 1];
    if (!last) continue;
    if (info?.lastPurchase && info.lastPurchase >= last) continue; // compró después de cotizar
    const days = daysBetween(last, today);
    if (days < QUOTE_MIN_DAYS || days > QUOTE_MAX_DAYS) continue;
    if (recentlyWorked(client, 'cotizaron', today)) continue;
    items.push({ client, info, quote: { date: last, amount: info?.quotes?.find((quote) => quote.date === last)?.amount || 0 }, days, reason: `cotizó hace ${days} días y no compró` });
  }
  items.sort((a, b) => a.days - b.days);
  return items.slice(0, limit);
}

// Prospectos nuevos: la cola de Prospección (ya sube a los de encaje, zona y puntaje altos).
export function newProspectsQueue({ prospects = [], checks = new Map(), skipped = [], limit = QUEUE_SIZE, rules } = {}) {
  const ids = buildQueue(prospects, checks, { skipped, rules }).slice(0, limit);
  const byId = new Map(prospects.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
