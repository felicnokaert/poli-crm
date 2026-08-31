import assert from 'node:assert/strict';
import test from 'node:test';
import health from '../api/health.js';
import simulate from '../api/simulate-whatsapp.js';
import readiness from '../api/readiness.js';

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
  assert.deepEqual(Object.keys(response.payload), ['ok', 'database', 'databaseReachable', 'metaWebhook', 'generalChannel', 'penosilChannel', 'simulator']);
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
