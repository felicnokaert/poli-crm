import test from 'node:test';
import assert from 'node:assert/strict';
import { canSee, deniedSet, filterNav, firstAllowedView, accessChange } from '../src/module-access.mjs';

const member = 'ezequiel@grupopoliplast.com.ar';
const rows = [{ module: 'shopify', allowed: false }, { module: 'mercadolibre.dinero', allowed: false }, { module: 'tasks', allowed: true }];

test('sin excepciones todos ven todo', () => {
  assert.equal(canSee(member, deniedSet([]), 'shopify'), true);
  assert.equal(canSee(member, null, 'mercadolibre', 'dinero'), true);
});

test('módulo y submódulo quitados', () => {
  const denied = deniedSet(rows);
  assert.equal(canSee(member, denied, 'shopify'), false);
  assert.equal(canSee(member, denied, 'shopify', 'productos'), false);
  assert.equal(canSee(member, denied, 'mercadolibre'), true);
  assert.equal(canSee(member, denied, 'mercadolibre', 'dinero'), false);
  assert.equal(canSee(member, denied, 'mercadolibre', 'resumen'), true);
  assert.equal(canSee(member, denied, 'tasks'), true);
});

test('Perfil y Datos no se pueden quitar y el administrador ve todo', () => {
  const denied = deniedSet([{ module: 'profile', allowed: false }, { module: 'settings', allowed: false }, { module: 'shopify', allowed: false }]);
  assert.equal(canSee(member, denied, 'profile'), true);
  assert.equal(canSee(member, denied, 'settings'), true);
  assert.equal(canSee('felipe@grupopoliplast.com.ar', denied, 'shopify'), true);
});

test('el menú saca los grupos vacíos y la pantalla cae en otra permitida', () => {
  const groups = [['Canales', [['shopify', 'Shopify', null]]], ['Hoy', [['dashboard', 'Inicio', null], ['tasks', 'Tareas', null]]]];
  const denied = deniedSet([{ module: 'shopify', allowed: false }, { module: 'tasks', allowed: false }]);
  assert.deepEqual(filterNav(groups, member, denied).map(([name, items]) => [name, items.length]), [['Hoy', 1]]);
  assert.equal(firstAllowedView(member, denied, 'shopify'), 'dashboard');
  assert.equal(firstAllowedView(member, deniedSet([{ module: 'dashboard', allowed: false }]), 'dashboard'), 'inbox');
});

test('al volver a permitir se borra la excepción', () => {
  assert.deepEqual(accessChange('A@x.com', 'shopify', true), { op: 'delete', email: 'a@x.com', module: 'shopify' });
  assert.equal(accessChange('A@x.com', 'shopify', false).row.allowed, false);
});
