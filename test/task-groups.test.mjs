import test from 'node:test';
import assert from 'node:assert/strict';
import { taskGroup, groupCounts, suggestHigh } from '../src/task-groups.mjs';

const TODAY = '2026-11-10';
const t = (extra) => ({ id: extra.title, done: false, priority: 'Media', ...extra });

test('clientes y seguimientos van a Vender', () => {
  assert.equal(taskGroup(t({ title: 'Retomar contacto con Astillero Kaisser - lleva 70 días sin actividad', dueDate: TODAY }), TODAY), 'vender');
  assert.equal(taskGroup(t({ title: 'Cualquier cosa', clientId: 'c1', dueDate: '2026-12-30' }), TODAY), 'vender');
  assert.equal(taskGroup(t({ title: 'x', origin: 'quote-followup' }), TODAY), 'vender');
});

test('canales y gestión si toca ML o Shopify y falta menos de una semana; después si falta más', () => {
  assert.equal(taskGroup(t({ title: '[ML] Duplicado SKU: Resina Epoxi 1kg', dueDate: '2026-11-11' }), TODAY), 'canales');
  assert.equal(taskGroup(t({ title: 'Shopify: subir fotos', dueDate: '2026-11-17' }), TODAY), 'canales');
  assert.equal(taskGroup(t({ title: 'Shopify: definir precio', dueDate: '2026-11-19' }), TODAY), 'despues');
  assert.equal(taskGroup(t({ title: 'Sin pista y sin fecha' }), TODAY), 'despues');
});

test('el conteo ignora las hechas', () => {
  const counts = groupCounts([t({ title: 'Seguimiento a X', dueDate: TODAY }), t({ title: 'Seguimiento a Y', done: true }), t({ title: 'ML: algo', dueDate: TODAY })], TODAY);
  assert.deepEqual(counts, { vender: 1, canales: 1, despues: 0 });
});

test('la propuesta de Alta pone primero lo de clientes, máximo 5, sin repetir las que ya son Alta', () => {
  const tasks = [
    t({ title: 'Retomar contacto con Astillero Kaisser', dueDate: TODAY }),
    t({ title: 'Seguimiento a Scimaca', dueDate: '2026-11-12' }),
    t({ title: 'Penosil — retomar publicación diaria', dueDate: TODAY }),
    t({ title: '[ML] Duplicado SKU: algo', dueDate: '2026-11-11' }),
    t({ title: 'Seguimiento ya urgente', dueDate: TODAY, priority: 'Alta' }),
    t({ title: 'Cotización vencida de Z', dueDate: '2026-11-05' }),
  ];
  const picks = suggestHigh(tasks, TODAY, 5).map((entry) => entry.task.title);
  assert.equal(picks[0], 'Cotización vencida de Z');
  assert.ok(picks.includes('Retomar contacto con Astillero Kaisser'));
  assert.ok(!picks.includes('Seguimiento ya urgente'));
  assert.ok(!picks.includes('[ML] Duplicado SKU: algo'));
  assert.ok(picks.length <= 5);
});
