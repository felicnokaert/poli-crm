import { buildPhoneMap, fetchChannelRows } from '../lib/channels.mjs';
import { normalizeWebhook, verifyMetaSignature, verifyMetaVerifyToken } from '../lib/whatsapp.mjs';
import { persistEvents } from '../lib/storage.mjs';
import { logError } from '../lib/log.mjs';
import { logWebhookCall, summarizePayload } from '../lib/webhook-log.mjs';

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
    if (mode === 'subscribe' && verifyMetaVerifyToken(token, process.env.WHATSAPP_VERIFY_TOKEN)) {
      await logWebhookCall({ method: 'GET', outcome: 'verify_ok', statusCode: 200 });
      return response.status(200).send(challenge);
    }
    await logWebhookCall({ method: 'GET', outcome: 'verify_rejected', statusCode: 403 });
    return response.status(403).json({ ok: false });
  }

  if (request.method !== 'POST') return response.status(405).json({ ok: false });

  let rawBody;
  try {
    rawBody = await readBody(request);
  } catch (error) {
    await logWebhookCall({ method: 'POST', outcome: 'body_error', statusCode: error instanceof PayloadTooLargeError ? 413 : 400 });
    if (error instanceof PayloadTooLargeError) return response.status(413).json({ ok: false, error: 'payload_too_large' });
    logError('whatsapp-webhook', 'failed reading request body', {}, error);
    return response.status(400).json({ ok: false, error: 'invalid_body' });
  }

  const signature = request.headers['x-hub-signature-256'];
  if (!verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET)) {
    // Sin esto un rechazo es invisible: queda constancia (sin datos del mensaje) para poder diagnosticar.
    logError('whatsapp-webhook', 'rejected: invalid or missing signature', { hasSignature: Boolean(signature), hasSecret: Boolean(process.env.META_APP_SECRET), bytes: rawBody.length });
    await logWebhookCall({ method: 'POST', outcome: 'bad_signature', statusCode: 401, bodyBytes: rawBody.length, hasSignature: Boolean(signature) });
    return response.status(401).json({ ok: false });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    logError('whatsapp-webhook', 'received a body with an invalid signature-verified JSON payload', {}, error);
    await logWebhookCall({ method: 'POST', outcome: 'invalid_json', statusCode: 400, bodyBytes: rawBody.length, hasSignature: true });
    return response.status(400).json({ ok: false, error: 'invalid_json' });
  }
  // Forma mínima esperada de un webhook real de WhatsApp Business - protege
  // normalizeWebhook (que asume `entry`/`changes` con optional chaining, así
  // que no explota, pero tampoco tiene sentido seguir si esto no es ni
  // remotamente un webhook de Meta) de payloads con la firma válida pero de
  // otro producto/versión de la API.
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload?.entry)) {
    await logWebhookCall({ method: 'POST', outcome: 'unexpected_shape', statusCode: 400, bodyBytes: rawBody.length, hasSignature: true, summary: summarizePayload(payload) });
    return response.status(400).json({ ok: false, error: 'unexpected_payload_shape' });
  }

  const phoneMap = buildPhoneMap(process.env, await fetchChannelRows(process.env));
  const events = normalizeWebhook(payload, phoneMap);
  try {
    const result = await persistEvents(events);
    await logWebhookCall({ method: 'POST', outcome: 'stored', statusCode: 200, bodyBytes: rawBody.length, hasSignature: true, summary: { ...summarizePayload(payload), accepted: events.length, stored: result.stored } });
    return response.status(200).json({ ok: true, accepted: events.length, stored: result.stored });
  } catch (error) {
    logError('whatsapp-webhook', 'failed persisting events', { eventCount: events.length }, error);
    await logWebhookCall({ method: 'POST', outcome: 'persist_failed', statusCode: 502, bodyBytes: rawBody.length, hasSignature: true, summary: summarizePayload(payload) });
    return response.status(502).json({ ok: false, error: 'persist_failed' });
  }
}
