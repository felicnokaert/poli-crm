import test from "node:test";
import assert from "node:assert/strict";

test('no suma los «Plan del día» de días anteriores, cierra los archivados y permite cerrar los viejos', async () => {
  const { trelloJsonSync, staleDailyPlanUpdates } = await import('../src/trello-json-import.mjs');
  const board = { lists: [{ id: 'l', name: 'Prioridad semanal' }], cards: [
    { id: '1', idList: 'l', name: '🎯 Plan del día 2026-10-24', due: '2026-10-24T20:00:00.000Z' },
    { id: '2', idList: 'l', name: '🎯 Plan del día 2026-11-17', due: '2026-11-17T20:00:00.000Z' },
    { id: '3', idList: 'l', name: 'Tarea vieja', closed: true },
  ] };
  const first = trelloJsonSync(board, [], '2026-11-17T12:00:00.000Z');
  assert.deepEqual(first.added.map((task) => task.id), ['trello-2']);
  const existing = [{ id: 'trello-3', title: 'Tarea vieja', done: false, trelloDue: '' }, { id: 'x', title: '🎯 Plan del día 2026-11-03', done: false }, { id: 'y', title: '🎯 Plan del día 2026-11-17', done: false }];
  const second = trelloJsonSync(board, existing, '2026-11-17T12:00:00.000Z');
  assert.ok(second.updates.some((item) => item.id === 'trello-3' && item.patch.done === true));
  assert.deepEqual(staleDailyPlanUpdates(existing, '2026-11-17').map((item) => item.id), ['x']);
});
