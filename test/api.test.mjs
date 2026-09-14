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
