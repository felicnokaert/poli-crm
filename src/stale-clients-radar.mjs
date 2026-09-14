import { clientContacts, normalizePhone } from './client-contacts.mjs';

function normalizeName(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Mismo criterio que commercialOutcome() en app-shared.jsx, repetido acá a
// propósito: este módulo es puro (.mjs, sin React/App.jsx) para poder
// testearlo solo y correrlo server-side (ver daily-maintenance.mjs), igual
// que ya hacen suggestion-rules.mjs con FAMILY_RULES.
function isOpenOutcome(client = {}) {
  if (client.outcome) return client.outcome === 'Abierto';
  if (client.stage === 'Ganado' || client.stage === 'Perdido' || client.stage === 'Pausado') return false;
  return true;
}

function clientPhones(client) {
  return clientContacts(client)
    .map((contact) => normalizePhone(contact.phone || contact.whatsappId))
    .filter(Boolean);
}

function lastInboxContactAt(client, inboxEvents) {
  const phones = new Set(clientPhones(client));
  if (!phones.size) return null;
  let latest = null;
  for (const event of inboxEvents) {
    const phone = normalizePhone(event.customer_wa_id || event.phone || '');
    if (!phone || !phones.has(phone)) continue;
    if (!latest || new Date(event.occurred_at) > new Date(latest)) latest = event.occurred_at;
  }
  return latest;
}

// Mismo criterio de match por nombre que ya usa findColdQuotes en
// cold-quotes.mjs (no hay clientId en las ventas todavía, ver
// AUDITORIA_MADUREZ_PRODUCTO_2026-09-15-novena.md sobre vinculación por
// nombre) - repetido acá para no crear una dependencia cruzada entre dos
// módulos de radar independientes.
function lastSaleAt(client, sales) {
  const nameKey = normalizeName(client.company || client.legalName || '');
  if (!nameKey) return null;
  let latest = null;
  for (const sale of sales) {
    const saleName = normalizeName(sale.customer);
    if (!saleName) continue;
    if (!(saleName.includes(nameKey) || nameKey.includes(saleName))) continue;
    if (!latest || new Date(sale.date) > new Date(latest)) latest = sale.date;
  }
  return latest;
}

// Clientes activos (resultado "Abierto", el default cuando no se fijó
// ninguno) sin ninguna señal de actividad -venta registrada o mensaje de
// WhatsApp de ese contacto- en los últimos `minDays`. Usa la fecha de alta
// de la ficha como piso cuando nunca hubo venta ni mensaje (una ficha
// cargada hace 40 días y nunca contactada también cuenta como "sin
// contacto"). Si no hay ninguna fecha de referencia (ni venta, ni mensaje,
// ni createdAt) el cliente se omite en vez de inventar un "días sin
// contacto" sin base real.
export function findStaleClients(clients = [], sales = [], inboxEvents = [], { today = new Date(), minDays = 30 } = {}) {
  const results = [];
  for (const client of clients) {
    if (!isOpenOutcome(client)) continue;
    const saleAt = lastSaleAt(client, sales);
    const contactAt = lastInboxContactAt(client, inboxEvents);
    const lastActivity = [saleAt, contactAt, client.createdAt].filter(Boolean).sort().pop();
    if (!lastActivity) continue;
    const daysSince = daysBetween(lastActivity, today.toISOString());
    if (daysSince < minDays) continue;
    results.push({
      clientId: client.id,
      company: client.company || client.legalName || '',
      daysSince,
      lastActivity,
    });
  }
  return results.sort((a, b) => b.daysSince - a.daysSince);
}
