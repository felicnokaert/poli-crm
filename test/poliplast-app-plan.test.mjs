import test from 'node:test';
import assert from 'node:assert/strict';
import { navForRole, roleAllows, FUTURE_MODULES, SUBMODULES } from '../src/poliplast-app-plan.mjs';

const groups = [['Ventas', [['sales', 'Ventas']]], ['Logística', [['entregas', 'Entregas'], ['etiquetas', 'Etiquetas']]], ['Configuración', [['profile', 'Perfil'], ['settings', 'Datos']]]];

test('Poliplast App: el administrador ve todo', () => {
  assert.deepEqual(navForRole(groups, 'admin'), groups);
});

test('Poliplast App: expedición no ve ventas ni Datos, y el grupo vacío desaparece', () => {
  const nav = navForRole(groups, 'expedicion');
  assert.deepEqual(nav.map(([name]) => name), ['Logística', 'Configuración']);
  assert.equal(roleAllows('expedicion', 'settings'), false);
  assert.equal(roleAllows('expedicion', 'profile'), true);
  assert.equal(roleAllows('deposito', 'sales'), false);
});

test('Poliplast App: cada módulo futuro tiene submódulos', () => {
  for (const id of Object.keys(FUTURE_MODULES)) assert.ok(SUBMODULES[id]?.length > 0, id);
});
