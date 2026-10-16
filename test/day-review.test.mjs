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

test('el Cierre del día no se llena con tareas automáticas pendientes (son alertas)', async () => {
  const { reviewDay } = await import('../src/day-review.mjs');
  const tasks = [
    { id: 'a1', title: 'Retomar contacto con X', source: 'auto-stale-client', dueDate: '2026-10-16', done: false },
    { id: 'a2', title: 'Responder a Y', source: 'auto-hot-lead', dueDate: '2026-10-14', done: false },
    { id: 'a3', title: 'Responder a Z', source: 'auto-hot-lead', done: true, completedAt: '2026-10-16T15:00:00Z' },
    { id: 'm1', title: 'Llamar a Ana', dueDate: '2026-10-16', done: false },
  ];
  const review = reviewDay('2026-10-16', { tasks, includeRoutine: false });
  assert.deepEqual(review.pendingTasks.map((t) => t.id), ['m1']);
  assert.deepEqual(review.carried.map((t) => t.id), []);
  assert.deepEqual(review.doneTasks.map((t) => t.id), ['a3'], 'una automática que la persona resolvió sí cuenta');
});

test('cierre en tanda de una versión vieja (misma hora exacta) no cuenta como "salió bien"', async () => {
  const { reviewDay } = await import('../src/day-review.mjs');
  const stamp = '2026-10-16T14:03:11.482Z';
  const tasks = [
    { id: 'a', title: 'Retomar contacto con CARROCERIAS 02 SRL - lleva 36 días sin actividad', source: 'auto-stale-client', done: true, completedAt: stamp, dueDate: '2026-10-15' },
    { id: 'b', title: 'Retomar contacto con CORBEB S R L - lleva 45 días sin actividad', source: 'auto-stale-client', done: true, completedAt: stamp, dueDate: '2026-10-15' },
    { id: 'c', title: 'Llamar a Juan', done: true, completedAt: '2026-10-16T15:20:00.000Z', dueDate: '2026-10-16' },
    { id: 'd', title: 'Retomar contacto con X', source: 'auto-stale-client', done: true, completedAt: '2026-10-16T16:00:00.000Z' },
  ];
  const review = reviewDay('2026-10-16', { tasks, includeRoutine: false });
  assert.deepEqual(review.doneTasks.map((task) => task.id).sort(), ['c', 'd']);
});
