import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HIDDEN, HOME_BLOCKS, moveBlock, normalizeLayout, toggleBlock, visibleBlockIds } from '../src/home-layout.mjs';

test('Inicio: sin orden guardado arranca corto (lo que avisa la campanita queda oculto)', () => {
  const all = visibleBlockIds(null, () => true, true);
  assert.deepEqual(all, HOME_BLOCKS.map((block) => block.id).filter((id) => !DEFAULT_HIDDEN.includes(id) && id !== 'logistica'));
  assert.ok(visibleBlockIds(null, (module) => module === 'entregas', false).includes('logistica'));
  assert.ok(all.includes('plan') && all.includes('metricas') && !all.includes('pausa'));
  const noAdmin = visibleBlockIds(null, () => true, false);
  assert.ok(!noAdmin.includes('atender'));
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

import { addBlock, addableBlocks, editableLayout, factoryLayout, hideBlock, moveVisible, reorderBlock, suggestBlocks } from '../src/home-layout.mjs';

test('Widgets: arrastrar pone la tarjeta antes o después de otra', () => {
  const all = () => true;
  let layout = editableLayout(null, all);
  layout = reorderBlock(layout, 'metricas', 'miDia', 'before');
  assert.equal(visibleBlockIds(layout, all, true)[0], 'metricas');
  layout = reorderBlock(layout, 'metricas', 'plan', 'after');
  assert.deepEqual(visibleBlockIds(layout, all, true).slice(0, 3), ['miDia', 'plan', 'metricas']);
  assert.deepEqual(reorderBlock(layout, 'plan', 'plan').order, normalizeLayout(layout).order);
});

test('Widgets: flechas mueven entre las visibles, saltando las ocultas', () => {
  const all = () => true;
  const layout = editableLayout(null, all);
  const ids = visibleBlockIds(layout, all, true);
  const moved = moveVisible(layout, ids[1], 1, all, true);
  assert.equal(visibleBlockIds(moved, all, true)[2], ids[1]);
  assert.deepEqual(moveVisible(layout, ids[0], -1, all, true).order, layout.order);
});

test('Widgets: quitar con la X y agregar desde la galería (al final)', () => {
  const all = () => true;
  let layout = editableLayout(null, all);
  layout = hideBlock(layout, 'plan');
  assert.ok(!visibleBlockIds(layout, all, true).includes('plan'));
  assert.ok(addableBlocks(layout, all, true).some((block) => block.id === 'plan'));
  layout = addBlock(layout, 'alertas');
  const ids = visibleBlockIds(layout, all, true);
  assert.equal(ids[ids.length - 1], 'alertas');
  // La galería no ofrece lo de otros módulos ni lo de administradores.
  const seller = (module) => module !== 'settings' && module !== 'entregas';
  assert.ok(!addableBlocks(editableLayout(null, seller), seller, false).some((block) => block.admin || block.module === 'entregas'));
});

test('Widgets: lo de fábrica es lo mismo que sin orden guardado', () => {
  const seller = (module) => module !== 'settings';
  assert.deepEqual(visibleBlockIds(factoryLayout(seller), seller, false), visibleBlockIds(null, seller, false));
});

test('Widgets: «¿qué querés ver?» sugiere por palabras, con o sin tildes', () => {
  assert.equal(suggestBlocks('quiero ver las entregas del depósito')[0].id, 'logistica');
  assert.equal(suggestBlocks('clientes que no volvieron a comprar')[0].id, 'atrasados');
  assert.ok(!suggestBlocks('clientes que no volvieron').some((block) => block.id === 'automatico'));
  assert.equal(suggestBlocks('mis numeros y metas')[0].id, 'metricas');
  assert.equal(suggestBlocks('').length, HOME_BLOCKS.length);
  assert.equal(suggestBlocks('zzzz').length, 0);
});
