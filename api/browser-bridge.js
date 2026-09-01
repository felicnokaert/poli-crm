import { persistEvents } from '../lib/storage.mjs';

const MAX_EVENTS = 100;
const MAX_TEXT = 12000;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const authorization = request.headers.authorization || '';
  if (!process.env.WHATSAPP_BRIDGE_TOKEN || authorization !== `Bearer ${process.env.WHATSAPP_BRIDGE_TOKEN}`) {
    return response.status(401).json({ error: 'Puente no autorizado.' });
  }

  const incoming = Array.isArray(request.body?.events) ? request.body.events.slice(0, MAX_EVENTS) : [];
  const events = incoming.flatMap((item) => {
    if (!item?.event_id || !['general', 'penosil'].includes(item.channel)) return [];
    if (!['inbound', 'outbound'].includes(item.direction)) return [];
    return [{
      event_id: String(item.event_id).slice(0, 240),
      phone_number_id: `browser-bridge:${item.channel}`,
      display_phone_number: item.channel === 'general' ? '+54 9 11 5262-7555' : '+54 9 11 7155-8957',
      channel: item.channel,
      direction: item.direction,
      customer_wa_id: String(item.chat_id || '').slice(0, 240),
      customer_name: String(item.chat_name || '').slice(0, 240),
      message_type: 'text',
      text_body: String(item.text_body || '').slice(0, MAX_TEXT),
      occurred_at: item.occurred_at && !Number.isNaN(Date.parse(item.occurred_at)) ? item.occurred_at : new Date().toISOString(),
      classification_status: item.direction === 'inbound' ? 'pending' : 'system',
      raw_payload: { source: 'authorized-whatsapp-web-chat', source_message_key: String(item.source_message_key || '').slice(0, 1000) },
    }];
  });

  const result = await persistEvents(events);
  return response.status(200).json({ ok: true, accepted: events.length, stored: result.stored });
}
