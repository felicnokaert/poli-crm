import test from 'node:test';
import assert from 'node:assert/strict';
import { accessAllows, tabSubs, toggleAccess } from '../src/team-access.mjs';

test('Productividad del equipo arranca apagada y se habilita a mano', () => {
  const diego = { email: 'diego@x', role: 'logistica', overrides: {} };
  assert.equal(accessAllows(diego, 'etiquetas', 'Productividad del equipo'), false);
  assert.equal(accessAllows(diego, 'etiquetas', 'Cortes'), true);
  const on = toggleAccess(diego, 'etiquetas', 'Productividad del equipo');
  assert.equal(accessAllows(on, 'etiquetas', 'Productividad del equipo'), true);
  const off = toggleAccess(on, 'etiquetas', 'Productividad del equipo');
  assert.deepEqual(off.overrides, {});
  assert.equal(accessAllows({ role: 'admin' }, 'etiquetas', 'Productividad del equipo'), true);
  assert.ok(!tabSubs('etiquetas').includes('Productividad del equipo'));
  assert.ok(tabSubs('etiquetas').includes('Cortes'));
});
