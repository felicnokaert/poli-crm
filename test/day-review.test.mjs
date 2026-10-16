import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, postponeTask, reviewDay } from '../src/day-review.mjs';
import { nextWorkday, previousWorkday, routineForDate, routineKey } from '../src/routine.mjs';

test('días hábiles saltean el fin de semana', () => {
  assert.equal(nextWorkday('2026-10-16'), '2026-10-19');
  assert.equal(previousWorkday('2026-10-19'), '2026-10-16');
});

test('localDate usa la hora de Argentina', () => {
  assert.equal(localDate('2026-10-17T01:30:00Z'), '2026-10-16');
  assert.equal(localDate(''), '');
});

test('el cierre cuenta rutina, tareas hechas, pendientes, postergadas y arrastradas', () => {
  const date = '2026-10-16';
  const blocks = routineForDate(date).blocks.filter((b) => !b.extra);
  const planChecks = { [routineKey(date, blocks[0].id)]: true };
  const tasks = [
    { id: 'a', title: 'Hecha', done: true, completedAt: '2026-10-16T15:00:00Z', dueDate: date },
    { id: 'b', title: 'Sin hacer', done: false, dueDate: date, priority: 'Alta' },
    { id: 'c', title: 'Postergada', done: false, dueDate: '2026-10-19', postponedFrom: [date] },
    { id: 'd', title: 'Vieja', done: false, dueDate: '2026-10-10' },
    { id: 'e', title: 'Evento', kind: 'evento', done: false, dueDate: date },
  ];
  const r = reviewDay(date, { planChecks, tasks });
  assert.deepEqual(r.doneTasks.map((t) => t.id), ['a']);
  assert.deepEqual(r.pendingTasks.map((t) => t.id), ['b']);
  assert.deepEqual(r.postponedTasks.map((t) => t.id), ['c']);
  assert.deepEqual(r.carried.map((t) => t.id), ['d']);
  assert.deepEqual(r.tomorrowTasks.map((t) => t.id), ['c']);
  assert.equal(r.routine.baseDone, 1);
  assert.equal(r.routine.missed.length, blocks.length - 1);
  assert.match(r.headline, /1 tarea resuelta/);
});

test('fin de semana no pide rutina', () => {
  const r = reviewDay('2026-10-17', {});
  assert.equal(r.weekend, true);
  assert.match(r.headline, /Descansá/);
});

test('postponeTask registra de dónde se movió y cuántas veces', () => {
  const t = postponeTask({ id: 'x', dueDate: '2026-10-16' }, '2026-10-19', 'S');
  assert.equal(t.dueDate, '2026-10-19');
  assert.equal(t.postponedCount, 1);
  assert.deepEqual(t.postponedFrom, ['2026-10-16']);
  const again = postponeTask(t, '2026-10-20', 'S');
  assert.equal(again.postponedCount, 2);
  assert.deepEqual(again.postponedFrom, ['2026-10-16', '2026-10-19']);
});

test('sin rutina propia el cierre solo mira las tareas', () => {
  const r = reviewDay('2026-10-16', { tasks: [{ id: 'a', title: 'Llamar', done: false, dueDate: '2026-10-16' }], includeRoutine: false });
  assert.equal(r.routine.missed.length, 0);
  assert.equal(r.routine.score, null);
  assert.doesNotMatch(r.headline, /Rutina/);
  assert.equal(r.pendingTasks.length, 1);
});
