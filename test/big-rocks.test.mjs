import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ROCKS, chosenRocks, rockCandidates, rockKey, rocksSummary, sierraKey } from '../src/big-rocks.mjs';
import { reviewDay } from '../src/day-review.mjs';

const D = '2026-11-04';
const tasks = [
  { id: 'a', title: 'Cotizar Juan', priority: 'Alta', dueDate: '2026-11-04' },
  { id: 'b', title: 'Llamar', priority: 'Media', dueDate: '2026-11-01' },
  { id: 'c', title: 'Hecha', priority: 'Alta', done: true },
  { id: 'd', title: 'Auto', source: 'auto-x' },
  { id: 'e', title: 'Evento', kind: 'evento' },
];

test('candidatas: pendientes reales, prioridad alta primero', () => {
  const list = rockCandidates(D, {}, tasks);
  assert.deepEqual(list.map((task) => task.id), ['a', 'b']);
});

test('elegidas salen de candidatas y cuentan para el cierre', () => {
  const checks = { [rockKey(D, 'a')]: true, [rockKey(D, 'c')]: true };
  assert.deepEqual(chosenRocks(D, checks, tasks).map((task) => task.id), ['a', 'c']);
  assert.deepEqual(rocksSummary(D, checks, tasks), { total: 2, done: 1 });
  assert.ok(!rockCandidates(D, checks, tasks).some((task) => task.id === 'a'));
  assert.equal(MAX_ROCKS, 3);
});

test('la sierra es de la semana (lunes) y el cierre menciona las piedras', () => {
  assert.equal(sierraKey('2026-11-04'), sierraKey('2026-11-06'));
  assert.notEqual(sierraKey('2026-11-04'), sierraKey('2026-11-09'));
  const review = reviewDay(D, { planChecks: { [rockKey(D, 'a')]: true }, tasks });
  assert.match(review.headline, /Piedras grandes: 0 de 1/);
});
