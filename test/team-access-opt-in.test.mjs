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

test('módulos nuevos: una cuenta sin rol no los ve hasta que se los habilitan (28/11)', async () => {
  const { accessAllows, toggleAccess } = await import('../src/team-access.mjs');
  const sinRol = { role: '', overrides: {} };
  for (const m of ['etiquetas', 'conteo', 'dosificado', 'recibos', 'facturacion', 'compras']) assert.equal(accessAllows(sinRol, m), false, m);
  for (const m of ['dashboard', 'sales', 'entregas', 'stock', 'quoter']) assert.equal(accessAllows(sinRol, m), true, m);
  assert.equal(accessAllows({ role: 'deposito', overrides: {} }, 'conteo'), true);
  assert.equal(accessAllows({ role: 'admin', overrides: {} }, 'recibos'), true);
  const habilitado = toggleAccess({ email: 'x@grupopoliplast.com.ar', role: '', overrides: {} }, 'conteo');
  assert.equal(accessAllows(habilitado, 'conteo'), true);
});
