import test from 'node:test';
import assert from 'node:assert/strict';
import { addBlock, blocksForDate, checkKey, dayProgress, removeBlock, toggleDay } from '../src/my-routine.mjs';

test('rutina propia: bloques por día, orden por hora y avance', () => {
  let routine = addBlock({}, { title: 'Cierre', time: '17:00' }, 't1');
  routine = addBlock(routine, { title: 'Llamadas', time: '9:00' }, 't2');
  routine = addBlock(routine, { title: '   ' }, 't3');
  assert.equal(routine.blocks.length, 2);
  const friday = '2026-11-27';
  assert.deepEqual(blocksForDate(routine, friday).map((block) => block.title), ['Llamadas', 'Cierre']);
  assert.equal(blocksForDate(routine, '2026-11-28').length, 0);
  const first = routine.blocks[1];
  assert.deepEqual(dayProgress(routine, friday, { [checkKey(friday, first.id)]: true }), { total: 2, done: 1, pct: 50 });
  routine = toggleDay(routine, first.id, 5);
  assert.equal(blocksForDate(routine, friday).length, 1);
  routine = removeBlock(routine, first.id);
  assert.equal(routine.blocks.length, 1);
});
