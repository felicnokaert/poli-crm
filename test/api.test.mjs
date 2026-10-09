import assert from 'node:assert/strict';
import test from 'node:test';
import health from '../api/health.js';
import simulate from '../api/simulate-whatsapp.js';
import { handleReadiness as readiness } from '../lib/readiness.mjs';
import inboxDelete from '../api/inbox-delete.js';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('health exposes configuration state without secret values', async () => {
  const response = responseRecorder();
  await health({}, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.deepEqual(Object.keys(response.payload), ['ok', 'database', 'databaseReachable', 'metaWebhook', 'generalChannel', 'penosilChannel', 'browserBridge', 'simulator']);
  assert.equal(response.payload.databaseReachable, false);
});

test('simulator rejects requests without its bearer token', async () => {
  const previous = process.env.COPILOT_SIMULATOR_TOKEN;
  process.env.COPILOT_SIMULATOR_TOKEN = 'test-token';
  const response = responseRecorder();
  await simulate({ method: 'POST', headers: {}, body: { channel: 'general', text: 'hola' } }, response);
  assert.equal(response.statusCode, 401);
  process.env.COPILOT_SIMULATOR_TOKEN = previous;
});

test('simulator normalizes a fake message without requiring Meta', async () => {
  const previous = process.env.COPILOT_SIMULATOR_TOKEN;
  process.env.COPILOT_SIMULATOR_TOKEN = 'test-token';
  const response = responseRecorder();
  await simulate({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { channel: 'penosil', customerName: 'Prueba', text: 'Consulta EasySpray' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.match(response.payload.eventId, /^sim\./);
  process.env.COPILOT_SIMULATOR_TOKEN = previous;
});

test('operational readiness requires a corporate session', async () => {
  const response = responseRecorder();
  await readiness({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error, 'Acceso corporativo requerido.');
});

test('health.js despacha a la logica de readiness cuando la URL pedida es /api/readiness', async () => {
  // Fusion de api/readiness.js dentro de api/health.js (ver el comentario
  // largo en ese archivo sobre el limite de 12 Serverless Functions del
  // plan Hobby de Vercel) - un rewrite en vercel.json hace que Vercel
  // preserve el pathname original en request.url. Sin auth, debe
  // comportarse exactamente igual que el readiness.js viejo: 401.
  const response = responseRecorder();
  await health({ method: 'GET', headers: {}, url: '/api/readiness' }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error, 'Acceso corporativo requerido.');
});

test('health.js sigue respondiendo su propio chequeo cuando la URL pedida es /api/health', async () => {
  const response = responseRecorder();
  await health({ url: '/api/health' }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.databaseReachable, false);
});

test('permanent inbox deletion requires an authenticated user', async () => {
  const response = responseRecorder();
  await inboxDelete({ method: 'POST', headers: {}, body: { eventIds: ['event-1'] } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error, 'Sesión no autorizada.');
});

test('permanent inbox deletion rejects a signed-in user outside the corporate domain', async () => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, fetch: globalThis.fetch };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    return { ok: true, json: async () => ({ id: 'u1', email: 'persona@gmail.com' }) };
  };
  try {
    const response = responseRecorder();
    await inboxDelete({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { eventIds: ['event-1'] } }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});

test('safeEqual compara secretos sin aceptar vacíos ni largos distintos', async () => {
  const { safeEqual } = await import('../lib/safe-equal.mjs');
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual(undefined, 'abc'), false);
});
