import test from 'node:test';
import assert from 'node:assert/strict';
import { carrierOf, returnIdOf, returnLookup } from '../lib/ml-returns.mjs';

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const accounts = [{ seller_id: 1, nickname: 'COMARG' }, { seller_id: 2, nickname: 'POLIPLAST SRL' }];
const store = { select: async () => [{ id: 'MLA1', sku: 'BL-10-1', title: 'Balde 10 L', variation_skus: [] }] };

test('returnIdOf lee el número de la etiqueta o del QR', () => {
  assert.equal(returnIdOf('{"id":"48485907441","t":"lm"}'), '48485907441');
  assert.equal(returnIdOf(' 4123456789 '), '4123456789');
  assert.equal(returnIdOf('hola'), '');
});

test('carrierOf traduce el transporte', () => {
  assert.equal(carrierOf({ tracking_method: 'Correo Argentino Clasico' }), 'Correo Argentino');
  assert.equal(carrierOf({ tracking_method: 'OCA' }), 'OCA');
});

test('busca como envío en cada cuenta, encuentra el reclamo y arma la devolución sin datos personales', async () => {
  const calls = [];
  const http = async (url, { headers }) => {
    const path = url.replace('https://api.mercadolibre.com', '');
    const token = headers.Authorization;
    calls.push(`${token} ${path}`);
    if (token === 'Bearer t1') return json(404, {});
    if (path === '/post-purchase/v2/claims/5550001/returns') return json(404, {});
    if (path === '/shipments/5550001') return json(200, { id: 5550001, order_id: 2000, tracking_method: 'Correo Argentino' });
    if (path.startsWith('/post-purchase/v1/claims/search')) return json(200, { data: [{ id: 777, type: 'returns' }] });
    if (path === '/post-purchase/v1/claims/777') return json(200, { id: 777, reason_id: 'PDD9939', status: 'opened', players: [{ role: 'complainant', user_id: 33 }] });
    if (path === '/post-purchase/v2/claims/777/returns') return json(200, { id: 88, status: 'shipped', resource_id: 2000, shipments: [{ shipment_id: 5550001, type: 'return' }], orders: [{ item_id: 'MLA1', quantity: 2 }] });
    if (path === '/users/33') return json(200, { nickname: 'COMPRADOR1', first_name: 'NO' });
    return json(404, {});
  };
  const result = await returnLookup('5550001', { http, store, tokenFor: async (a) => `t${a.seller_id}`, accounts, withDebug: true });
  assert.equal(result.found, true);
  assert.equal(result.return.account, 'POLIPLAST SRL');
  assert.equal(result.return.claim_id, '777');
  assert.equal(result.return.shipment_id_devolucion, '5550001');
  assert.equal(result.return.carrier, 'Correo Argentino');
  assert.equal(result.return.buyer, 'COMPRADOR1');
  assert.deepEqual(result.return.lines, [{ sku: 'BL-10-1', description: 'Balde 10 L', qty: 2, item_id: 'MLA1' }]);
  assert.ok(!JSON.stringify(result.return).includes('NO"'));
  assert.ok(Array.isArray(result.debug) && result.debug.length > 0);
});

test('si no está en ninguna cuenta devuelve found false', async () => {
  const http = async () => json(404, {});
  const result = await returnLookup('123456789', { http, store, tokenFor: async (a) => `t${a.seller_id}`, accounts });
  assert.equal(result.found, false);
  assert.equal(result.debug, undefined);
});
