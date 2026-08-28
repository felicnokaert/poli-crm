import { normalizeWebhook, verifyMetaSignature } from '../lib/whatsapp.mjs';

export const config = { api: { bodyParser: false } };

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function persistEvents(events) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !events.length) return { stored: 0, configured: false };
  const response = await fetch(`${url}/rest/v1/whatsapp_events?on_conflict=event_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(events),
  });
  if (!response.ok) throw new Error(`Storage failed: ${response.status}`);
  return { stored: events.length, configured: true };
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return response.status(200).send(challenge);
    return response.status(403).json({ ok: false });
  }

  if (request.method !== 'POST') return response.status(405).json({ ok: false });
  const rawBody = await readBody(request);
  const signature = request.headers['x-hub-signature-256'];
  if (!verifyMetaSignature(rawBody, signature, process.env.META_APP_SECRET)) return response.status(401).json({ ok: false });

  const payload = JSON.parse(rawBody.toString('utf8'));
  const phoneMap = {
    [process.env.WHATSAPP_GENERAL_PHONE_ID]: 'general',
    [process.env.WHATSAPP_PENOSIL_PHONE_ID]: 'penosil',
  };
  const events = normalizeWebhook(payload, phoneMap);
  const result = await persistEvents(events);
  return response.status(200).json({ ok: true, accepted: events.length, stored: result.stored });
}

