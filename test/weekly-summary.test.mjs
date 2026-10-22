import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeWeeklySummary, weekActivity, weeklySummaryText } from '../src/weekly-summary.mjs';

test('resumen semanal: lo de los últimos 7 días, listo para copiar', () => {
  assert.ok(canSeeWeeklySummary('david@grupopoliplast.com.ar'));
  assert.ok(!canSeeWeeklySummary('brenda@grupopoliplast.com.ar'));
  const activity = weekActivity({
    today: '2026-10-22',
    prospects: [{ history: [{ at: '2026-10-20T12:00:00Z', state: 'Con interés' }, { at: '2026-09-01T12:00:00Z', state: 'Contactado' }] }],
    clients: [{ contactLog: [{ at: '2026-10-21T10:00:00Z', outcome: 'Precio' }] }],
    tasks: [{ done: true, completedAt: '2026-10-21T10:00:00Z' }, { done: false, dueDate: '2026-10-01' }],
  });
  assert.deepEqual([activity.contacted, activity.interested, activity.tasksDone, activity.tasksLate], [2, 1, 1, 1]);
  const text = weeklySummaryText({ activity, gaps: 3, today: '2026-10-22' });
  assert.match(text, /Resumen semanal del CRM\* \(16\/10 al 22\/10\)/);
  assert.match(text, /motivo de rechazo más común fue "Precio"/);
  assert.match(text, /3 preguntas sin buena respuesta/);
});
