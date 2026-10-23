import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skuCleanup, skuCleanupCsv } from '../src/ml-sku-cleanup.mjs';

const item = (id, sku, title, sold = 1, status = 'active') => ({ id, sku, title, sold_quantity: sold, status, permalink: `https://ml/${id}` });

test('mismo producto con dos SKU se junta en uno; distinto tamaño no', () => {
  const out = skuCleanup([
    item('A', 'RE-608-0.750', 'Resina Epoxi Poxiplast 750gr Vidrio Liquido Cristal', 1104),
    item('B', 'RE-608-750', 'Resina Epoxi 750gr Vidrio Liquido Cristal', 1067),
    item('C', 'RE-608-1500', 'Resina Epoxi 1500gr Vidrio Liquido Cristal', 300),
  ]);
  assert.equal(out.similar.length, 1);
  assert.equal(out.similar[0].keepSku, 'RE-608-0.750');
  assert.equal(out.similar[0].otherSku, 'RE-608-750');
});

test('publicaciones sin SKU: sugiere el de una parecida con el mismo tamaño', () => {
  const out = skuCleanup([
    item('A', 'RE-608-1500', 'Resina Epoxi 1500gr Vidrio Liquido Cristal', 300),
    item('B', '', 'Resina Epoxi 1500gr Vidrio Liquido Cristal Joyas', 5),
    item('C', '', 'Algo totalmente distinto', 2),
    item('D', '', 'Pausada', 9, 'paused'),
  ]);
  assert.deepEqual(out.suggestions.map((row) => [row.id, row.suggestedSku]), [['B', 'RE-608-1500'], ['C', '']]);
  assert.match(skuCleanupCsv(out), /Cargar SKU/);
});
