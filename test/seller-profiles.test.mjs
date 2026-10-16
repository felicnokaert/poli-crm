import test from 'node:test';
import assert from 'node:assert/strict';
import { SELLER_PROFILES, sellerByName } from '../src/seller-profiles.mjs';

test('hay ficha completa para cada vendedor', () => {
  assert.deepEqual(SELLER_PROFILES.map((p) => p.id), ['yuliani', 'brenda', 'ezequiel', 'juan', 'david']);
  for (const p of SELLER_PROFILES) {
    for (const key of ['name', 'role', 'area', 'receives', 'risk', 'habit']) assert.ok(p[key], `${p.id}.${key}`);
    assert.ok(p.assist.length >= 2);
  }
});

test('sellerByName ignora mayúsculas y apellido', () => {
  assert.equal(sellerByName('Brenda Pérez').id, 'brenda');
  assert.equal(sellerByName('nadie'), null);
});
