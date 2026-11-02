import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { normalizeSocialWebhook, socialEnabled } from '../lib/social-webhook.mjs';
import handler from '../api/whatsapp-webhook.js';

const MAP = { 'IG_ACC': 'resinplast-ig', 'PAGE_1': 'poliplast-fb' };

const igDm = { object: 'instagram', entry: [{ id: 'IG_ACC', time: 1793600000, messaging: [
  { sender: { id: 'U1' }, recipient: { id: 'IG_ACC' }, timestamp: 1793600000123, message: { mid: 'm1', text: 'Hola, precio de la resina?' } },
  { sender: { id: 'IG_ACC' }, recipient: { id: 'U1' }, timestamp: 1793600001000, message: { mid: 'm2', text: 'Nuestra respuesta', is_echo: true } },
  { sender: { id: 'U2' }, recipient: { id: 'IG_ACC' }, timestamp: 1793600002000, message: { mid: 'm3', attachments: [{ type: 'image' }] } },
] }] };

test('mensajes directos de Instagram: solo lo del cliente, con formato de evento de la bandeja', () => {
  const events = normalizeSocialWebhook(igDm, MAP);
  assert.equal(events.length, 2); // el eco no se guarda
  assert.deepEqual(events.map((e) => e.event_id), ['ig:m1', 'ig:m3']);
  assert.equal(events[0].channel, 'resinplast-ig');
  assert.equal(events[0].customer_wa_id, 'ig:U1');
  assert.equal(events[0].message_type, 'instagram_dm');
  assert.equal(events[0].text_body, 'Hola, precio de la resina?');
  assert.equal(events[0].occurred_at, new Date(1793600000123).toISOString());
  assert.equal(events[0].direction, 'inbound');
  assert.equal(events[0].classification_status, 'pending');
  assert.equal(events[1].text_body, '[image]');
});

test('comentarios de Instagram y de Facebook; los propios no cuentan', () => {
  const ig = normalizeSocialWebhook({ object: 'instagram', entry: [{ id: 'IG_ACC', changes: [
    { field: 'comments', value: { id: 'c1', text: 'Cuánto sale?', from: { id: 'U9', username: 'obra_sur' }, media: { id: 'p1' } } },
    { field: 'comments', value: { id: 'c2', text: 'Gracias!', from: { id: 'IG_ACC', username: 'resinplast' } } },
  ] }] }, MAP);
  assert.equal(ig.length, 1);
  assert.equal(ig[0].message_type, 'instagram_comment');
  assert.equal(ig[0].customer_name, 'obra_sur');
  assert.equal(ig[0].event_id, 'ig:comment:c1');

  const fb = normalizeSocialWebhook({ object: 'page', entry: [{ id: 'PAGE_1', time: 1793600000, changes: [
    { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'f1', message: 'Hacen envíos?', from: { id: 'U7', name: 'Ana Pérez' }, created_time: 1793600005 } },
    { field: 'feed', value: { item: 'comment', verb: 'edited', comment_id: 'f2', message: 'x', from: { id: 'U7' } } },
    { field: 'feed', value: { item: 'like', verb: 'add', from: { id: 'U7' } } },
  ] }] }, MAP);
  assert.equal(fb.length, 1);
  assert.equal(fb[0].channel, 'poliplast-fb');
  assert.equal(fb[0].customer_wa_id, 'fb:U7');
  assert.equal(fb[0].message_type, 'facebook_comment');
});

test('Messenger usa el mismo formato y una cuenta sin línea queda en unknown', () => {
  const events = normalizeSocialWebhook({ object: 'page', entry: [{ id: 'OTRA', messaging: [{ sender: { id: 'U3' }, recipient: { id: 'OTRA' }, timestamp: 1793600000000, message: { mid: 'x1', text: 'Hola' } }] }] }, MAP);
  assert.equal(events[0].channel, 'unknown');
  assert.equal(events[0].message_type, 'messenger');
  assert.equal(events[0].customer_wa_id, 'fb:U3');
  assert.deepEqual(normalizeSocialWebhook({ object: 'whatsapp_business_account', entry: [] }, MAP), []);
  assert.deepEqual(normalizeSocialWebhook(null), []);
});

test('apagado por defecto: solo META_SOCIAL_ENABLED=true lo prende', () => {
  assert.equal(socialEnabled({}), false);
  assert.equal(socialEnabled({ META_SOCIAL_ENABLED: 'false' }), false);
  assert.equal(socialEnabled({ META_SOCIAL_ENABLED: 'TRUE' }), true);
});

// El receptor real, con firma de Meta y Supabase simulado.
async function post(payload, env, { fetchMock } = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const secret = 'secreto-de-prueba';
  const request = Readable.from([body]);
  request.method = 'POST';
  request.headers = { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}` };
  let result;
  const response = { status(code) { result = { code }; return this; }, json(data) { result.body = data; return this; }, send(data) { result.body = data; return this; } };
  const keys = ['META_APP_SECRET', 'META_APP_SECRET_TEST', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_SOCIAL_ENABLED'];
  const saved = { env: Object.fromEntries(keys.map((key) => [key, process.env[key]])), fetch: global.fetch };
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, { META_APP_SECRET: secret, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }, env);
  global.fetch = fetchMock;
  try { await handler(request, response); } finally {
    global.fetch = saved.fetch;
    for (const key of keys) { if (saved.env[key] === undefined) delete process.env[key]; else process.env[key] = saved.env[key]; }
  }
  return result;
}

test('receptor: con lo social apagado confirma y no guarda nada; prendido guarda', async () => {
  const stored = [];
  const fetchMock = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/whatsapp_events')) { stored.push(...JSON.parse(options.body)); return { ok: true, status: 201, json: async () => [] }; }
    if (u.includes('/whatsapp_channels')) return { ok: true, json: async () => [{ channel_key: 'resinplast-ig', phone_number_id: 'IG_ACC' }] };
    return { ok: true, status: 201, json: async () => [] }; // registro del webhook
  };
  const off = await post(igDm, {}, { fetchMock });
  assert.equal(off.code, 200);
  assert.equal(off.body.ignored, 'social_disabled');
  assert.equal(stored.length, 0);

  const on = await post(igDm, { META_SOCIAL_ENABLED: 'true' }, { fetchMock });
  assert.equal(on.code, 200);
  assert.equal(on.body.accepted, 2);
  assert.deepEqual(stored.map((e) => e.channel), ['resinplast-ig', 'resinplast-ig']);
});
