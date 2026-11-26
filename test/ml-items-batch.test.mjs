import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsBatch } from '../lib/ml-items-batch.mjs';

test('itemsBatch usa /items?ids cuando ML lo deja', async () => {
  const calls = [];
  const get = async (path) => { calls.push(path); return [{ code: 200, body: { id: 'MLA1' } }]; };
  const out = await itemsBatch(get, ['MLA1'], 'id,price', 't');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/items\?ids=MLA1&attributes=id,price$/);
  assert.equal(out[0].body.id, 'MLA1');
});

test('itemsBatch pide de a una si /items?ids está deprecado y conserva el 403', async () => {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith('/items?ids')) throw new Error('Mercado Libre (/items): Resource deprecated - client no longer allowed to consume this resource');
    if (path.includes('MLA2')) throw new Error('Mercado Libre (/items/MLA2): forbidden');
    return { id: 'MLA1', price: 10 };
  };
  const out = await itemsBatch(get, ['MLA1', 'MLA2'], 'id,price', 't');
  assert.deepEqual(out, [{ code: 200, body: { id: 'MLA1', price: 10 } }, { code: 403, body: { id: 'MLA2' } }]);
  assert.ok(calls.includes('/items/MLA1?attributes=id,price'));
});

test('itemsBatch no esconde otros errores', async () => {
  const get = async () => { throw new Error('HTTP 500'); };
  await assert.rejects(() => itemsBatch(get, ['MLA1'], '', 't'), /500/);
});
