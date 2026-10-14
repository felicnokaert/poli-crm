import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseMeta, tokenCoversWaba } from '../lib/meta-diagnose.mjs';

function fakeGraph(routes) {
  return async (url) => {
    const path = url.replace('https://graph.facebook.com/v23.0', '');
    const key = Object.keys(routes).find((candidate) => path.startsWith(candidate));
    const route = key ? routes[key] : { status: 404, body: { error: { message: 'no existe' } } };
    return { ok: route.status === undefined || route.status < 400, status: route.status ?? 200, json: async () => route.body };
  };
}

test('tokenCoversWaba distingue lista explícita, todos los objetos y ausencia', () => {
  const listed = { granularScopes: [{ scope: 'whatsapp_business_management', targetIds: ['1', '2'] }] };
  assert.equal(tokenCoversWaba(listed, '2'), true);
  assert.equal(tokenCoversWaba(listed, '3'), false);
  assert.equal(tokenCoversWaba({ granularScopes: [{ scope: 'whatsapp_business_management', targetIds: 'todos los objetos' }] }, '9'), 'todos');
  assert.equal(tokenCoversWaba({ granularScopes: [] }, '1'), false);
  assert.equal(tokenCoversWaba({ error: 'x' }, '1'), null);
});

test('diagnoseMeta resume token y cuentas sin exponer el token', async () => {
  const secret = 'TOKEN-SECRETO-123';
  const http = fakeGraph({
    '/debug_token': {
      body: { data: { app_id: '857', application: 'Agente', type: 'SYSTEM_USER', is_valid: true, scopes: ['whatsapp_business_management'], granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['111'] }] } },
    },
    '/111?': { body: { id: '111', name: 'General', owner_business_info: { name: 'Poliuretano' } } },
    '/111/phone_numbers': { body: { data: [{ id: 'p1', display_phone_number: '+54 9 11 5262-7555', status: 'CONNECTED', platform_type: 'CLOUD_API', quality_rating: 'GREEN' }] } },
    '/111/subscribed_apps': { body: { data: [{ whatsapp_business_api_data: { name: 'Agente Poliplast' } }] } },
    '/222?': { status: 400, body: { error: { message: "Object with ID '222' does not exist" } } },
    '/222/phone_numbers': { status: 400, body: { error: { message: 'sin permiso' } } },
    '/222/subscribed_apps': { status: 400, body: { error: { message: 'sin permiso' } } },
  });
  const report = await diagnoseMeta({ token: secret, wabas: { general: '111', penosil: '222' }, http });
  assert.equal(report.token.isValid, true);
  const [general, penosil] = report.accounts;
  assert.equal(general.tokenCovers, true);
  assert.equal(general.account.owner, 'Poliuretano');
  assert.equal(general.phoneNumbers[0].platformType, 'CLOUD_API');
  assert.deepEqual(general.subscribedApps, ['Agente Poliplast']);
  assert.equal(penosil.tokenCovers, false);
  assert.match(penosil.account.error, /does not exist/);
  assert.equal(JSON.stringify(report).includes(secret), false);
});
