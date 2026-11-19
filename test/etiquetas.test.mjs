import test from 'node:test';
import assert from 'node:assert/strict';
import { arIso, etiquetasHandler, isReady, keyIsValid, lookup, parseIds, pending, rateLimited } from '../lib/etiquetas.mjs';

const reply = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });
const KEY = 'k'.repeat(32);
const env = { LABELS_API_KEY: KEY, ML_CLIENT_ID: 'a', ML_CLIENT_SECRET: 'b', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' };
const accounts = [{ seller_id: 1, nickname: 'A' }, { seller_id: 2, nickname: 'B' }];
const store = { select: async () => [{ id: 'MLA9', sku: 'RE-608-750', title: 'Resina' }] };
const tokenFor = async () => 't';

test('parseIds, arIso y estados', () => {
  assert.deepEqual(parseIds('48485907441, 48485907441,abc,12'), ['48485907441']);
  assert.equal(arIso('2026-11-19T15:00:00Z'), '2026-11-19T12:00:00-03:00');
  assert.ok(isReady({ status: 'ready_to_ship', substatus: 'printed', logistic_type: 'self_service' }));
  assert.ok(!isReady({ status: 'ready_to_ship', substatus: 'printed', logistic_type: 'fulfillment' }));
  assert.ok(!isReady({ status: 'shipped', substatus: null }));
});

test('clave: vale la actual o la siguiente y no una corta', () => {
  assert.ok(keyIsValid(KEY, env));
  assert.ok(keyIsValid('n'.repeat(30), { ...env, LABELS_API_KEY_NEXT: 'n'.repeat(30) }));
  assert.ok(!keyIsValid('x', env) && !keyIsValid('', env));
  assert.ok(!keyIsValid('abc', { LABELS_API_KEY: 'abc' }));
});

test('lookup prueba cada cuenta, trae SKU y no devuelve datos del comprador', async () => {
  const http = async (url, options) => {
    const token = options.headers.Authorization;
    if (url.includes('/shipments/111/items')) return reply(200, [{ item_id: 'MLA9', quantity: 2 }]);
    if (url.includes('/shipments/111')) return reply(200, { id: 111, status: 'ready_to_ship', substatus: 'printed', logistic_type: 'cross_docking', date_created: '2026-11-19T15:00:00Z', receiver_address: { address_line: 'Calle 1' } });
    return reply(403, {});
  };
  let calls = 0;
  const counting = async (url, options) => { calls += 1; return url.includes('/shipments/111') && calls === 1 ? reply(403, {}) : http(url, options); };
  const out = await lookup(['111', '222'], { http: counting, store, tokenFor, accounts, withDesc: false });
  assert.equal(out[0].found, true);
  assert.equal(out[0].account, 'B');
  assert.deepEqual(out[0].lines, [{ sku: 'RE-608-750', qty: 2, item_id: 'MLA9' }]);
  assert.equal(out[1].found, false);
  assert.ok(!JSON.stringify(out).includes('Calle 1'));
  const withDesc = await lookup(['111'], { http, store, tokenFor, accounts: [accounts[0]], withDesc: true });
  assert.equal(withDesc[0].lines[0].description, 'Resina');
});

test('pending lista solo envíos listos y sin Full', async () => {
  const http = async (url) => {
    if (url.includes('/orders/search')) return reply(200, { results: [
      { id: 1, shipping: { id: 10 }, order_items: [{ item: { id: 'MLA9' }, quantity: 3 }] },
      { id: 2, shipping: { id: 20 }, order_items: [{ item: { id: 'MLA9' }, quantity: 1 }] },
      { id: 3, shipping: { id: 30 }, order_items: [] },
    ] });
    if (url.includes('/shipments/10')) return reply(200, { id: 10, status: 'ready_to_ship', substatus: 'ready_for_pickup', logistic_type: 'cross_docking' });
    if (url.includes('/shipments/20')) return reply(200, { id: 20, status: 'ready_to_ship', substatus: 'printed', logistic_type: 'fulfillment' });
    return reply(200, { id: 30, status: 'shipped', substatus: null });
  };
  const out = await pending({ http, store, tokenFor, accounts: [accounts[0]] });
  assert.deepEqual(out.shipments.map((row) => row.id), ['10']);
  assert.equal(out.shipments[0].lines[0].qty, 3);
});

test('handler: 401 sin clave, 400 sin ids, health y límite 429', async () => {
  const res = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
  let r = res(); await etiquetasHandler({ method: 'GET', headers: {}, query: { etiquetas: 'health' } }, r, env, async () => reply(200, []));
  assert.equal(r.code, 401);
  r = res(); await etiquetasHandler({ method: 'OPTIONS', headers: {}, query: {} }, r, env);
  assert.equal(r.code, 204);
  r = res(); await etiquetasHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { etiquetas: 'health' } }, r, env, async () => reply(200, [{ nickname: 'A', updated_at: '2026-11-19T15:00:00Z' }]));
  assert.equal(r.code, 200); assert.equal(r.body.last_sync_at, '2026-11-19T12:00:00-03:00');
  r = res(); await etiquetasHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { etiquetas: 'lookup', ids: 'x' } }, r, env, async () => reply(200, []));
  assert.equal(r.code, 400);
  assert.ok(!rateLimited('otra', 0));
  for (let i = 0; i < 125; i += 1) rateLimited('otra', 0);
  assert.ok(rateLimited('otra', 1000));
});
