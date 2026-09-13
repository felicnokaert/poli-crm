import { normalizeWebhook, verifyMetaSignature, verifyMetaVerifyToken } from '../lib/whatsapp.mjs';
import { persistEvents } from '../lib/storage.mjs';
import { logError } from '../lib/log.mjs';

export const config = { api: { bodyParser: false } };

// Meta documenta payloads de webhook de unos pocos KB. 5MB es un margen
// generoso para lotes grandes de mensajes/status sin dejar el endpoint
// abierto a que una request (maliciosa o rota) fuerce a acumular un body
// arbitrariamente grande en memoria antes de validar la firma.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

async function readBody(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new PayloadTooLargeError('Webhook body excede el tamaño máximo permitido.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];
    if (mode === 'subscribe' && verifyMetaVerifyToken(token, process.env.WHATSAPP_VERIFY_TOKEN)) return response.status(200).send(challenge);
    return response.status(403).json({ ok: false });
  }

  if (request.method !== 'POST') return response.status(405).json({ ok: false });

  let rawBody;
  try {
    rawBody = await readBody(request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return response.status(413).json({ ok: false, error: 'payload_too_large' });
    logError('whatsapp-webhook', 'failed reading request body', {}, error);
    return response.status(400).json({ ok: false, error: 'invalid_body' });
  }

  const signature = request.headers['x-hub-signature-256'];
  if (!verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET)) return response.status(401).json({ ok: false });

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    logError('whatsapp-webhook', 'received a body with an invalid signature-verified JSON payload', {}, error);
    return response.status(400).json({ ok: false, error: 'invalid_json' });
  }
  // Forma mínima esperada de un webhook real de WhatsApp Business - protege
  // normalizeWebhook (que asume `entry`/`changes` con optional chaining, así
  // que no explota, pero tampoco tiene sentido seguir si esto no es ni
  // remotamente un webhook de Meta) de payloads con la firma válida pero de
  // otro producto/versión de la API.
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload?.entry)) {
    return response.status(400).json({ ok: false, error: 'unexpected_payload_shape' });
  }

  const phoneMap = {
    [process.env.WHATSAPP_GENERAL_PHONE_ID]: 'general',
    [process.env.WHATSAPP_PENOSIL_PHONE_ID]: 'penosil',
    [process.env.WHATSAPP_JUAN_PHONE_ID]: 'juan',
  };
  const events = normalizeWebhook(payload, phoneMap);
  try {
    const result = await persistEvents(events);
    return response.status(200).json({ ok: true, accepted: events.length, stored: result.stored });
  } catch (error) {
    logError('whatsapp-webhook', 'failed persisting events', { eventCount: events.length }, error);
    return response.status(502).json({ ok: false, error: 'persist_failed' });
  }
}
