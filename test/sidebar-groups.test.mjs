import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { NAV_GROUPS, SOLO_GROUPS } = await loadJsxModule('src/AppSidebar.jsx');
const ids = (name) => NAV_GROUPS.find(([group]) => group === name)[1].map(([id]) => id);

test('Inicio va suelto: grupo propio, primero y con un solo ítem', () => {
  assert.equal(NAV_GROUPS[0][0], 'Inicio');
  assert.deepEqual(ids('Inicio'), ['dashboard']);
  assert.ok(SOLO_GROUPS.includes('Inicio'));
});

test('Por revisar e Historial están en Ventas', () => {
  assert.ok(ids('Ventas').includes('inbox'));
  assert.ok(ids('Ventas').includes('conversations'));
});
