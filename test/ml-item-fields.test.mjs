import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_FIELDS, ITEM_QUERY, getItems, variationSkus } from '../lib/mercadolibre.mjs';

test('la sincronización pide las variaciones con sus atributos (SKU por color o talle)', async () => {
  assert.ok(ITEM_FIELDS.split(',').includes('variations'));
  assert.match(ITEM_QUERY, /include_attributes=all/);
  let url = '';
  const http = async (u) => { url = u; return { ok: true, json: async () => [] }; };
  await getItems(['MLA1'], 'token', http);
  assert.match(url, /variations/);
  assert.match(url, /include_attributes=all/);
});

test('el SKU de cada variación sale del atributo SELLER_SKU', () => {
  const item = { variations: [{ id: 1, attributes: [{ id: 'SELLER_SKU', value_name: 'gn-100 neg' }] }, { id: 2, seller_custom_field: 'GN-100-ROS' }] };
  assert.deepEqual(variationSkus(item), [{ id: '1', sku: 'GN-100NEG' }, { id: '2', sku: 'GN-100-ROS' }]);
});

test('scopeInfo: detecta si el token de Mercado Libre trae permiso de escritura', async () => {
  const { scopeInfo } = await import('../lib/mercadolibre.mjs');
  assert.deepEqual(scopeInfo('offline_access read write'), { scopes: ['offline_access', 'read', 'write'], write: true });
  assert.equal(scopeInfo('offline_access read').write, false);
  assert.equal(scopeInfo('').write, false);
});
