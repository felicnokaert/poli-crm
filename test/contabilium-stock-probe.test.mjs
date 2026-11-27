import test from 'node:test';
import assert from 'node:assert/strict';
import { stockProbePaths } from '../lib/contabilium.mjs';

test('las rutas de prueba del stock por depósito llevan el id y solo leen (GET)', () => {
  const paths = stockProbePaths('123', 'PS-1');
  assert.ok(paths.includes('/api/conceptos/123'));
  assert.ok(paths.some((path) => path.includes('depositos')));
  assert.ok(paths.every((path) => path.startsWith('/api/')));
});

import { syncStock, depotsFrom } from '../lib/contabilium.mjs';
import { contabiliumByCode, pivotStock } from '../src/stock-model.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const env = { CONTABILIUM_POLIPLAST_CLIENT_ID: 'a', CONTABILIUM_POLIPLAST_CLIENT_SECRET: 'b' };

function memoryStore() {
  let saved = null;
  return { select: async () => (saved ? [{ detail: saved }] : []), upsert: async (_table, rows) => { saved = rows[0].detail; }, get detail() { return saved; } };
}

test('stock por depósito: solo Villa Domínico y Mar del Plata, por páginas', async () => {
  const calls = [];
  const http = async (url) => {
    calls.push(url);
    if (url.endsWith('/token')) return json({ access_token: 'T' });
    if (url.includes('getDepositos')) return json([{ Id: 1, Nombre: 'VILLA DOMINICO' }, { Id: 2, Nombre: 'MAR DEL PLATA' }, { Id: 3, Nombre: 'FULL' }, { Id: 4, Nombre: 'CARROZADOS' }]);
    const id = new URL(url).searchParams.get('id');
    if (id === '1') return json({ Items: [{ Codigo: 'if-1517', Nombre: 'ISO', StockActual: 10 }], TotalPage: 1 });
    if (id === '2') return json({ Items: [{ Codigo: 'IF-1517', StockActual: 460 }, { Codigo: 'PM248136', StockActual: 3 }], TotalPage: 1 });
    return json({ Items: [] });
  };
  const store = memoryStore();
  const result = await syncStock({ key: 'POLIPLAST' }, env, http, store, { deadline: Date.now() + 5000, pause: 0, retryWait: 0 });
  assert.equal(result.done, true);
  assert.deepEqual(result.depots, ['VILLA DOMINICO', 'MAR DEL PLATA']);
  assert.ok(!calls.some((url) => /id=3|id=4/.test(url)));
  const map = contabiliumByCode(store.detail);
  const [row] = pivotStock([{ sku: 'IF-1517', name: 'ISO', depot: 'Mar del Plata', at: '1', status: 'hay' }], map);
  assert.equal(row.cbVd, 10);
  assert.equal(row.cbMdq, 460);
});

test('sin depósitos visibles termina y lo deja dicho', async () => {
  const http = async (url) => (url.endsWith('/token') ? json({ access_token: 'T' }) : json([]));
  const store = memoryStore();
  const result = await syncStock({ key: 'POLIPLAST' }, env, http, store, { deadline: Date.now() + 5000, pause: 0, retryWait: 0 });
  assert.equal(result.done, true);
  assert.deepEqual(store.detail.companies.POLIPLAST.depots, []);
  assert.deepEqual(depotsFrom({ Items: [{ ID: 7, Nombre: 'X' }] }), [{ id: 7, name: 'X', active: true }]);
});

test('ante un 429 de Contabilium espera y reintenta', async () => {
  let hits = 0;
  const http = async (url) => {
    if (url.endsWith('/token')) return json({ access_token: 'T' });
    if (url.includes('getDepositos')) return json([{ Id: 1, Nombre: 'VILLA DOMINICO' }]);
    hits += 1;
    if (hits === 1) return json({ Message: 'Too many' }, 429);
    return json({ Items: [{ Codigo: 'A', StockActual: 2 }], TotalPage: 1 });
  };
  const store = memoryStore();
  const result = await syncStock({ key: 'POLIPLAST' }, env, http, store, { deadline: Date.now() + 5000, pause: 0, retryWait: 1 });
  assert.equal(result.error, null);
  assert.equal(result.done, true);
  assert.equal(store.detail.companies.POLIPLAST.items.A.d.vd, 2);
});
