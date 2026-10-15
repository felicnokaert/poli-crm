import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRELLO_PLAN, PLAN_START, PLAN_END, PLAN_HOLIDAYS, PLAN_LIGHT_DAYS } from '../src/trello-plan.mjs';
import { planTasks, planSummary, tasksForDay, monthGrid } from '../src/trello-plan-import.mjs';

test('el plan va del 16/10 al 31/12, solo en días hábiles y sin feriados', () => {
  assert.ok(TRELLO_PLAN.length > 80);
  for (const item of TRELLO_PLAN) {
    assert.ok(item.dueDate >= PLAN_START && item.dueDate <= PLAN_END, item.title);
    const day = new Date(`${item.dueDate}T12:00:00`).getDay();
    assert.ok(day >= 1 && day <= 5, `${item.title} cae en fin de semana`);
    assert.ok(!PLAN_HOLIDAYS.includes(item.dueDate) && !PLAN_LIGHT_DAYS.includes(item.dueDate));
    assert.match(item.url, /^https:\/\/trello\.com\/c\//);
  }
});

test('ninguna jornada pasa de 5 tareas y la reputación de ML es lo primero', () => {
  const load = {};
  for (const item of TRELLO_PLAN) load[item.dueDate] = (load[item.dueDate] || 0) + 1;
  assert.ok(Math.max(...Object.values(load)) <= 5);
  assert.match(TRELLO_PLAN[0].title, /Reputación|fraude/i);
  assert.equal(TRELLO_PLAN[0].dueDate, '2026-10-16');
});

test('cargar el plan crea tareas una sola vez y respeta lo ya cargado', () => {
  const first = planTasks(TRELLO_PLAN, [], '2026-10-16T10:00:00Z');
  assert.equal(first.length, TRELLO_PLAN.length);
  assert.equal(first[0].source, 'trello-plan');
  assert.equal(first.find((task) => task.priority === 'Alta') != null, true);
  assert.deepEqual(planTasks(TRELLO_PLAN, first), []);
  const edited = first.map((task, index) => (index === 0 ? { ...task, done: true } : task));
  assert.equal(planTasks(TRELLO_PLAN, edited).length, 0, 'no pisa tareas completadas');
  assert.deepEqual(planSummary(TRELLO_PLAN, first.slice(0, 10)), { total: TRELLO_PLAN.length, loaded: 10, pending: TRELLO_PLAN.length - 10 });
});

test('tareas del día y grilla del mes', () => {
  const tasks = [{ id: 'a', dueDate: '2026-10-16', done: true }, { id: 'b', dueDate: '2026-10-16', done: false, priority: 'Alta' }, { id: 'c', dueDate: '2026-10-19' }];
  assert.deepEqual(tasksForDay(tasks, '2026-10-16').map((task) => task.id), ['b', 'a']);
  const grid = monthGrid(2026, 9);
  assert.equal(grid.length % 7, 0);
  assert.equal(grid.indexOf('2026-10-01'), 3, 'el 1/10/2026 es jueves');
});
