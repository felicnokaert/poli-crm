import crypto from 'node:crypto';
import { persistEvents } from '../lib/storage.mjs';

const MAX_TEXT_LENGTH = 4000; // igual de largo que un mensaje real de WhatsApp permite razonablemente
const MAX_NAME_LENGTH = 200;
const WA_ID_PATTERN = /^\d{6,20}$/; // customer_wa_id real de Meta: solo dígitos

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ ok: false });
  const expected = process.env.COPILOT_SIMULATOR_TOKEN;
  const received = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!expected || received !== expected) return response.status(401).json({ ok: false });

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ ok: false, error: 'invalid_body' });
  }
  const { channel, customerName, customerWaId, text } = body;
  if (!['general', 'penosil'].includes(channel)) {
    return response.status(400).json({ ok: false, error: 'channel_and_text_required' });
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    return response.status(400).json({ ok: false, error: 'channel_and_text_required' });
  }
  if (customerWaId !== undefined && (typeof customerWaId !== 'string' || !WA_ID_PATTERN.test(customerWaId))) {
    return response.status(400).json({ ok: false, error: 'invalid_customer_wa_id' });
  }
  if (customerName !== undefined && (typeof customerName !== 'string' || customerName.length > MAX_NAME_LENGTH)) {
    return response.status(400).json({ ok: false, error: 'invalid_customer_name' });
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
  try {
    const result = await persistEvents([event]);
    return response.status(200).json({ ok: true, eventId: event.event_id, stored: result.stored });
  } catch (error) {
    console.error(`simulate-whatsapp failed persisting event for channel "${channel}":`, error);
    return response.status(502).json({ ok: false, error: 'persist_failed' });
  }
}

