import assert from 'node:assert/strict';
import test from 'node:test';
import { createOAuthState, normalizeItem, openToken, sealToken, verifyOAuthState } from '../lib/mercadolibre.mjs';

const secret = 'una-clave-de-prueba-suficientemente-larga';

test('Mercado Libre tokens are encrypted and recoverable', () => {
  const sealed = sealToken('APP_USR-secret-token', secret);
  assert.equal(sealed.includes('APP_USR'), false);
  assert.equal(openToken(sealed, secret), 'APP_USR-secret-token');
});

test('OAuth state is signed, scoped to an account and expires', () => {
  const state = createOAuthState({ accountKey: 'foam', userId: 'u1' }, secret, 1000);
  assert.equal(verifyOAuthState(state, secret, 2000).accountKey, 'foam');
  assert.throws(() => verifyOAuthState(`${state}x`, secret, 2000));
  assert.throws(() => verifyOAuthState(state, secret, 700_000));
});

test('only known Mercado Libre accounts can start OAuth', () => {
  assert.throws(() => createOAuthState({ accountKey: 'otra', userId: 'u1' }, secret));
});

test('item snapshots retain account ownership', () => {
  const row = normalizeItem({ id: 'MLA1', title: 'Producto', status: 'active', available_quantity: 3, sold_quantity: 2 }, 'account-1');
  assert.equal(row.account_id, 'account-1');
  assert.equal(row.item_id, 'MLA1');
  assert.equal(row.available_quantity, 3);
});
