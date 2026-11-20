import test from 'node:test';
import assert from 'node:assert/strict';
import { itemRow, variationSkus } from '../lib/mercadolibre.mjs';
import { filterBoard, issuesOf } from '../src/ml-board.mjs';

test('variationSkus lee el SKU de cada variación (campo del vendedor o atributo)', () => {
  const item = { variations: [{ id: 1, seller_custom_field: 'ab 1' }, { id: 2, attributes: [{ id: 'SELLER_SKU', value_name: 'cd-2' }] }, { id: 3 }] };
  assert.deepEqual(variationSkus(item), [{ id: '1', sku: 'AB1' }, { id: '2', sku: 'CD-2' }]);
});

test('itemRow: sin SKU en la publicación toma el único de las variaciones; con varios deja sku vacío y los guarda aparte', () => {
  const one = itemRow({ id: 'MLA1', variations: [{ id: 1, seller_custom_field: 'X' }, { id: 2, seller_custom_field: 'X' }] }, 7);
  assert.equal(one.sku, 'X');
  const many = itemRow({ id: 'MLA2', variations: [{ id: 1, seller_custom_field: 'A' }, { id: 2, seller_custom_field: 'B' }] }, 7);
  assert.equal(many.sku, '');
  assert.equal(many.variation_skus.length, 2);
  assert.equal(itemRow({ id: 'MLA3', seller_custom_field: 'Z', variations: [] }, 7).sku, 'Z');
});

test('filtro Sin SKU: cuenta solo las que no tienen SKU ni en variaciones, y no marca filas sin esas columnas', () => {
  const items = [
    { id: 'a', status: 'active', sku: '', variation_skus: [] },
    { id: 'b', status: 'active', sku: '', variation_skus: [{ id: '1', sku: 'A' }, { id: '2', sku: 'B' }] },
    { id: 'c', status: 'active', sku: 'C', variation_skus: [] },
    { id: 'd', status: 'active' },
  ];
  assert.deepEqual(filterBoard(items, { issue: 'sin-sku' }).map((item) => item.id), ['a']);
  assert.ok(issuesOf(items[3]).every((issue) => issue.key !== 'sin-sku'));
});
