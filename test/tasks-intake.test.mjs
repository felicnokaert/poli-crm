import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTaskIntake, validateTaskIntakePayload } from '../lib/tasks-intake.mjs';

test('validateTaskIntakePayload exige externalId, origin y title', () => {
  assert.deepEqual(validateTaskIntakePayload({}), [
    'externalId es obligatorio (string estable, ej. "shopify-seo-null-RE-608-1.5").',
    'origin es obligatorio (ej. "Automatización Shopify").',
    'title es obligatorio.',
  ]);
});

test('validateTaskIntakePayload acepta un payload minimo valido', () => {
  assert.deepEqual(
    validateTaskIntakePayload({ externalId: 'shopify-1', origin: 'Automatización Shopify', title: 'Completar SEO' }),
    [],
  );
});

test('validateTaskIntakePayload rechaza dueDate con formato invalido', () => {
  const errors = validateTaskIntakePayload({
    externalId: 'a', origin: 'b', title: 'c', dueDate: '20-09-2026',
  });
  assert.ok(errors.some((message) => message.includes('dueDate')));
});

test('validateTaskIntakePayload rechaza priority fuera de las 3 opciones', () => {
  const errors = validateTaskIntakePayload({
    externalId: 'a', origin: 'b', title: 'c', priority: 'Urgentísima',
  });
  assert.ok(errors.some((message) => message.includes('priority')));
});

test('applyTaskIntake crea una tarea nueva con el modelo de blankTask + externalId/origin', () => {
  const result = applyTaskIntake(
    { tasks: [] },
    { externalId: 'ml-dup-123', origin: 'Automatización ML', title: 'Revisar duplicado', description: 'Publicación 123 parece duplicada de la 456.', category: 'duplicados', dueDate: '2026-09-20' },
    '2026-09-16T12:00:00.000Z',
    () => 'fixed-id',
  );
  assert.equal(result.changed, true);
  assert.equal(result.wasNew, true);
  assert.deepEqual(result.nextState.tasks, [{
    id: 'fixed-id',
    externalId: 'ml-dup-123',
    origin: 'Automatización ML',
    company: 'Automatización ML',
    title: 'Revisar duplicado',
    trigger: 'Publicación 123 parece duplicada de la 456.',
    category: 'duplicados',
    cadence: 'duplicados',
    priority: 'Media',
    dueDate: '2026-09-20',
    clientId: '',
    done: false,
    createdAt: '2026-09-16T12:00:00.000Z',
    updatedAt: '2026-09-16T12:00:00.000Z',
  }]);
});

test('applyTaskIntake no duplica si ya existe una tarea con el mismo externalId', () => {
  const existingTask = { id: 'x', externalId: 'shopify-seo-1', title: 'Ya existente' };
  const result = applyTaskIntake(
    { tasks: [existingTask] },
    { externalId: 'shopify-seo-1', origin: 'Automatización Shopify', title: 'Intento de duplicado' },
    '2026-09-16T12:00:00.000Z',
  );
  assert.equal(result.changed, false);
  assert.equal(result.wasNew, false);
  assert.equal(result.task, existingTask);
  assert.equal(result.nextState.tasks.length, 1);
});

test('applyTaskIntake no pisa otras claves del workspace', () => {
  const result = applyTaskIntake(
    { tasks: [], clients: [{ id: '1' }], dailySignals: { foo: 'bar' } },
    { externalId: 'x', origin: 'y', title: 'z' },
    '2026-09-16T12:00:00.000Z',
    () => 'id-1',
  );
  assert.deepEqual(result.nextState.clients, [{ id: '1' }]);
  assert.deepEqual(result.nextState.dailySignals, { foo: 'bar' });
});
