import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HIDDEN, HOME_BLOCKS, moveBlock, normalizeLayout, toggleBlock, visibleBlockIds } from '../src/home-layout.mjs';

test('Inicio: sin orden guardado arranca corto (lo que avisa la campanita queda oculto)', () => {
  const all = visibleBlockIds(null, () => true, true);
  assert.deepEqual(all, HOME_BLOCKS.map((block) => block.id).filter((id) => !DEFAULT_HIDDEN.includes(id) && id !== 'logistica'));
  assert.ok(visibleBlockIds(null, (module) => module === 'entregas', false).includes('logistica'));
  assert.ok(all.includes('plan') && all.includes('metricas') && all.includes('pausa'));
  const noAdmin = visibleBlockIds(null, () => true, false);
  assert.ok(!noAdmin.includes('pausa') && !noAdmin.includes('atender'));
});

test('Inicio: expedición (sin ventas ni tareas) no ve tarjetas de ventas', () => {
  const allows = (module) => ['entregas', 'etiquetas'].includes(module);
  assert.deepEqual(visibleBlockIds(null, allows, false), ['logistica']);
  const comercial = visibleBlockIds(null, (module) => module !== 'settings', false);
  assert.ok(comercial.includes('metricas'));
});

test('Inicio: subir, bajar y ocultar', () => {
  let layout = normalizeLayout(null);
  layout = moveBlock(layout, 'metricas', -1, () => true, true);
  assert.equal(visibleBlockIds(layout, () => true, true)[1], 'metricas');
  layout = toggleBlock(layout, 'plan');
  assert.ok(!visibleBlockIds(layout, () => true, true).includes('plan'));
  layout = toggleBlock(layout, 'plan');
  assert.ok(visibleBlockIds(layout, () => true, true).includes('plan'));
  // Mover salta las tarjetas que la persona no ve.
  const allows = (module) => module !== 'sales';
  const base = normalizeLayout(null);
  const moved = moveBlock(base, 'atender', -1, allows, true);
  assert.deepEqual(visibleBlockIds(moved, allows, true).slice(0, 3), ['miDia', 'atender', 'plan']);
});
