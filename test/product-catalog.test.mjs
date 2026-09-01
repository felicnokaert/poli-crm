import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCT_CATALOG } from '../src/product-catalog.mjs';

test('loads the audited product seed without treating unavailable products as valid stock', () => {
  assert.equal(PRODUCT_CATALOG.length, 59);
  assert.ok(PRODUCT_CATALOG.some((item) => item.family === 'PENOSIL' && item.validation === 'Audited'));
  assert.ok(PRODUCT_CATALOG.some((item) => item.validation === 'Review'));
  assert.ok(PRODUCT_CATALOG.some((item) => item.validation === 'NoStock'));
  assert.equal(PRODUCT_CATALOG.every((item) => item.name && item.sku), true);
});
