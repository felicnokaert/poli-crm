import crypto from 'node:crypto';
import { persistEvents } from '../lib/storage.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ ok: false });
  const expected = process.env.COPILOT_SIMULATOR_TOKEN;
  const received = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!expected || received !== expected) return response.status(401).json({ ok: false });

  const { channel, customerName, customerWaId, text } = request.body || {};
  if (!['general', 'penosil'].includes(channel) || !text?.trim()) {
    return response.status(400).json({ ok: false, error: 'channel_and_text_required' });
  }
  const event = {
    event_id: `sim.${crypto.randomUUID()}`,
    phone_number_id: channel === 'general' ? 'sim-general' : 'sim-penosil',
    display_phone_number: channel === 'general' ? '+54 9 11 5262-7555' : '+54 9 11 7155-8957',
    channel,
    direction: 'inbound',
    customer_wa_id: customerWaId || '5491100000000',
    customer_name: customerName || 'Cliente de prueba',
    message_type: 'text',
    text_body: text.trim(),
    occurred_at: new Date().toISOString(),
    classification_status: 'pending',
    raw_payload: { simulated: true },
  };
  const result = await persistEvents([event]);
  return response.status(200).json({ ok: true, eventId: event.event_id, stored: result.stored });
}

