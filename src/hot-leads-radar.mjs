import { whatsappContactIdentity } from './whatsapp-threads.mjs';

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Mismo heurístico que draftFromWhatsApp en App.jsx (urgente + comercial =
// Caliente) pero aplicado ANTES de que alguien clasifique el mensaje - así
// detectamos leads calientes que están sentados sin respuesta en "Por
// revisar", no solo los que ya se convirtieron en cliente. Duplicado a
// propósito en vez de importado: draftFromWhatsApp vive en App.jsx (no es un
// módulo aislado) y esta detección tiene que poder correr sin React.
function looksHot(text = '') {
  const lower = text.toLowerCase();
  const urgent = /hoy|urgente|mañana|manana|esta semana|para el viernes|cuanto antes/.test(lower);
  const commercial = /precio|cotiz|comprar|necesito|kg|litros|unidades|cantidad|stock/.test(lower);
  return urgent && commercial;
}

// Conversaciones que el heurístico de "Por revisar" marcaría como Caliente,
// pero llevan más de minDays sin que nadie las clasifique ni conteste. Es la
// alerta que le faltaba al backlog de la bandeja: hoy un mensaje urgente se
// pierde en el medio de docenas de mensajes fríos sin ningún aviso.
export function findStaleHotLeads(inboxEvents = [], { today = new Date(), minDays = 2 } = {}) {
  const byContact = new Map();
  for (const event of inboxEvents) {
    if (event.direction !== 'inbound') continue;
    if (event.classification_status && event.classification_status !== 'pending') continue;
    const identity = whatsappContactIdentity(event);
    const existing = byContact.get(identity);
    if (!existing || new Date(event.occurred_at) > new Date(existing.occurred_at)) byContact.set(identity, event);
  }
  const results = [];
  for (const event of byContact.values()) {
    if (!looksHot(event.text_body || '')) continue;
    const daysSince = daysBetween(event.occurred_at, today.toISOString());
    if (daysSince < minDays) continue;
    results.push({
      customer: event.customer_name || event.customer_wa_id || '',
      channel: event.channel,
      text: event.text_body || '',
      eventId: event.event_id,
      occurredAt: event.occurred_at,
      daysSince,
    });
  }
  return results.sort((a, b) => b.daysSince - a.daysSince);
}
