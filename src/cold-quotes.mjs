import { inferIntent } from './commercial-intelligence.mjs';
import { whatsappContactIdentity } from './whatsapp-threads.mjs';

function normalizeName(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR');
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Alguien preguntó precio y nunca volvió a comprar. Toma el mensaje más
// reciente de cada contacto (para no repetir la misma persona varias
// veces), y si su intención era de precio/cotización y pasaron
// suficientes días sin que aparezca una venta a su nombre después de ese
// mensaje, se marca como cotización fría.
export function findColdQuotes(inboxEvents = [], sales = [], { today = new Date(), minDays = 7 } = {}) {
  const byContact = new Map();
  for (const event of inboxEvents) {
    if (event.direction !== 'inbound') continue;
    if (event.classification_status === 'excluded') continue;
    const identity = whatsappContactIdentity(event);
    const existing = byContact.get(identity);
    if (!existing || new Date(event.occurred_at) > new Date(existing.occurred_at)) byContact.set(identity, event);
  }
  const results = [];
  for (const event of byContact.values()) {
    if (inferIntent(event.text_body || '') !== 'Precio / cotización') continue;
    const daysSince = daysBetween(event.occurred_at, today.toISOString());
    if (daysSince < minDays) continue;
    const customer = event.customer_name || event.customer_wa_id || '';
    const nameKey = normalizeName(customer);
    const converted = sales.some((sale) => {
      const saleName = normalizeName(sale.customer);
      if (!saleName || !nameKey) return false;
      const matches = saleName.includes(nameKey) || nameKey.includes(saleName);
      return matches && new Date(sale.date) >= new Date(event.occurred_at);
    });
    if (converted) continue;
    results.push({ customer, daysSince, text: event.text_body || '', eventId: event.event_id, occurredAt: event.occurred_at });
  }
  return results.sort((a, b) => b.daysSince - a.daysSince);
}
