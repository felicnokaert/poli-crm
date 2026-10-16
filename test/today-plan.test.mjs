import test from 'node:test';
import assert from 'node:assert/strict';
import { todayPlan } from '../src/today-plan.mjs';
import { routineForDate, routineKey } from '../src/routine.mjs';

test('mi día: próximo bloque sin hacer, eventos ordenados y lo que quedó de ayer', () => {
  const date = '2026-10-16';
  const blocks = routineForDate(date).blocks;
  const planChecks = { [routineKey(date, blocks[0].id)]: true };
  const tasks = [
    { id: 'e2', kind: 'evento', title: 'B', dueDate: date, startTime: '15:00' },
    { id: 'e1', kind: 'evento', title: 'A', dueDate: date, startTime: '09:00' },
    { id: 'x', title: 'Pendiente de ayer', done: false, dueDate: '2026-10-15' },
  ];
  const plan = todayPlan(date, { planChecks, tasks, nowMinutes: 0 });
  assert.equal(plan.progress.done, 1);
  assert.equal(plan.next.title, blocks[1].title);
  assert.deepEqual(plan.events.map((e) => e.id), ['e1', 'e2']);
  assert.equal(plan.leftover, 1);
  assert.equal(plan.lastDate, '2026-10-15');
});

test('fin de semana no propone bloque', () => {
  const plan = todayPlan('2026-10-17', {});
  assert.equal(plan.weekend, true);
  assert.equal(plan.next, null);
});
