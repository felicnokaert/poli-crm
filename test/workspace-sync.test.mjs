import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordDeletions,
  restoreRecordId,
  completeTasksThrough,
  mergeWorkspaceState,
  workspaceStatesEqual,
} from '../src/workspace.mjs';

function baseState(overrides = {}) {
  return {
    clients: [],
    interactions: [],
    tasks: [],
    inbox: [],
    opportunities: [],
    sales: [],
    boardLists: [],
    boardCards: [],
    salesGoals: [],
    businessUnits: [],
    deletedRecordIds: {},
    dismissedInboxEventIds: [],
    ignoredWhatsAppContacts: [],
    planChecks: {},
    commercialMasterVersion: '',
    historyResetVersion: '',
    tasksClosedThrough: '',
    primaryChannel: 'general',
    profileName: '',
    mergeLogs: [],
    ...overrides,
  };
}

// --- recordDeletions ---

test('recordDeletions agrega ids borrados a la colección correspondiente', () => {
  const next = recordDeletions(baseState(), { clients: ['c1'] });
  assert.deepEqual(next.deletedRecordIds.clients, ['c1']);
});

test('recordDeletions no duplica ids ya presentes y ordena el resultado', () => {
  const state = baseState({ deletedRecordIds: { clients: ['c2'] } });
  const next = recordDeletions(state, { clients: ['c1', 'c2'] });
  assert.deepEqual(next.deletedRecordIds.clients, ['c1', 'c2']);
});

test('recordDeletions preserva colecciones no mencionadas en la llamada', () => {
  const state = baseState({ deletedRecordIds: { tasks: ['t1'] } });
  const next = recordDeletions(state, { clients: ['c1'] });
  assert.deepEqual(next.deletedRecordIds.tasks, ['t1']);
  assert.deepEqual(next.deletedRecordIds.clients, ['c1']);
});

// --- restoreRecordId ---

test('restoreRecordId quita un id de la colección indicada', () => {
  const state = baseState({ deletedRecordIds: { clients: ['c1', 'c2'] } });
  const next = restoreRecordId(state, 'clients', 'c1');
  assert.deepEqual(next.deletedRecordIds.clients, ['c2']);
});

test('restoreRecordId es un no-op si la colección no existe', () => {
  const state = baseState();
  assert.deepEqual(restoreRecordId(state, 'no-existe', 'c1'), state);
});

test('restoreRecordId es un no-op si no se pasa id', () => {
  const state = baseState({ deletedRecordIds: { clients: ['c1'] } });
  assert.deepEqual(restoreRecordId(state, 'clients', undefined), state);
});

// consolidateDuplicateClients: ver test/disabled-consolidate-duplicate-clients.test.mjs
// (movida ahí — es código desactivado a propósito, no un flujo vivo, y no debe
// contarse junto a la cobertura funcional real de este archivo).

// --- completeTasksThrough ---

test('completeTasksThrough marca como hechas las tareas con vencimiento hasta la fecha de corte', () => {
  const state = baseState({
    tasks: [
      { id: 't1', dueDate: '2026-01-05', done: false },
      { id: 't2', dueDate: '2026-01-15', done: false },
    ],
  });
  const next = completeTasksThrough(state, '2026-01-10T00:00:00Z');
  assert.equal(next.tasks.find((t) => t.id === 't1').done, true);
  assert.ok(next.tasks.find((t) => t.id === 't1').completedAt);
  assert.equal(next.tasks.find((t) => t.id === 't2').done, false);
  assert.equal(next.tasksClosedThrough, '2026-01-10T00:00:00Z');
});

test('completeTasksThrough no toca tareas ya hechas', () => {
  const state = baseState({ tasks: [{ id: 't1', dueDate: '2026-01-05', done: true, completedAt: 'antes' }] });
  const next = completeTasksThrough(state, '2026-01-10T00:00:00Z');
  assert.equal(next.tasks[0].completedAt, 'antes');
});

test('completeTasksThrough es un no-op sin cutoff', () => {
  const state = baseState({ tasks: [{ id: 't1', dueDate: '2026-01-05', done: false }] });
  assert.deepEqual(completeTasksThrough(state, ''), state);
});

test('completeTasksThrough es un no-op si el cutoff no avanza respecto al ya aplicado', () => {
  const state = baseState({
    tasksClosedThrough: '2026-01-10T00:00:00Z',
    tasks: [{ id: 't1', dueDate: '2026-01-05', done: false }],
  });
  const next = completeTasksThrough(state, '2026-01-05T00:00:00Z');
  assert.deepEqual(next, state);
});

// --- mergeWorkspaceState ---

test('mergeWorkspaceState: un registro borrado en un dispositivo gana sobre una edición del mismo registro en el otro', () => {
  const local = baseState({
    clients: [{ id: 'c1', company: 'Editado en local', updatedAt: '2026-03-01T00:00:00Z' }],
    deletedRecordIds: {},
  });
  const remote = baseState({
    clients: [{ id: 'c1', company: 'Original', updatedAt: '2026-01-01T00:00:00Z' }],
    deletedRecordIds: { clients: ['c1'] },
  });
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.clients, []);
  assert.deepEqual(merged.deletedRecordIds.clients, ['c1']);
});

test('mergeWorkspaceState reconcilia deletedRecordIds uniendo ambos lados sin duplicar', () => {
  const local = baseState({ deletedRecordIds: { clients: ['c1'] } });
  const remote = baseState({ deletedRecordIds: { clients: ['c2', 'c1'] } });
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.deletedRecordIds.clients, ['c1', 'c2']);
});

test('mergeWorkspaceState filtra del inbox los eventos ya descartados (dismissedInboxEventIds)', () => {
  const local = baseState({
    inbox: [{ event_id: 'e1', occurred_at: '2026-01-01T00:00:00Z' }, { event_id: 'e2', occurred_at: '2026-01-02T00:00:00Z' }],
    dismissedInboxEventIds: ['e1'],
  });
  const remote = baseState();
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.inbox.map((item) => item.event_id), ['e2']);
});

test('mergeWorkspaceState filtra del inbox los tipos de preview obsoletos aunque no estén descartados a mano', () => {
  const local = baseState({
    inbox: [
      { event_id: 'e1', occurred_at: '2026-01-01T00:00:00Z', message_type: 'unread_preview' },
      { event_id: 'e2', occurred_at: '2026-01-02T00:00:00Z', message_type: 'text' },
    ],
  });
  const merged = mergeWorkspaceState(local, baseState());
  assert.deepEqual(merged.inbox.map((item) => item.event_id), ['e2']);
});

test('mergeWorkspaceState descarta interacciones previas al historyResetVersion más nuevo', () => {
  const local = baseState({
    historyResetVersion: '2026-02-01T00:00:00Z',
    interactions: [{ id: 'i1', createdAt: '2026-03-01T00:00:00Z' }],
  });
  const remote = baseState({
    historyResetVersion: '',
    interactions: [{ id: 'i0', createdAt: '2026-01-01T00:00:00Z' }],
  });
  const merged = mergeWorkspaceState(local, remote);
  // El lado remoto no tiene un historyResetVersion tan nuevo como el local, así
  // que sus interacciones viejas (anteriores al reset local) se descartan.
  assert.deepEqual(merged.interactions.map((i) => i.id), ['i1']);
  assert.equal(merged.historyResetVersion, '2026-02-01T00:00:00Z');
});

test('mergeWorkspaceState conserva interacciones de ambos lados cuando ninguno tiene historyResetVersion', () => {
  const local = baseState({ interactions: [{ id: 'i1', createdAt: '2026-01-02T00:00:00Z' }] });
  const remote = baseState({ interactions: [{ id: 'i2', createdAt: '2026-01-01T00:00:00Z' }] });
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.interactions.map((i) => i.id), ['i1', 'i2']);
});

test('mergeWorkspaceState toma la versión más reciente de un registro presente en ambos lados', () => {
  const local = baseState({ clients: [{ id: 'c1', company: 'Viejo', updatedAt: '2026-01-01T00:00:00Z' }] });
  const remote = baseState({ clients: [{ id: 'c1', company: 'Nuevo', updatedAt: '2026-02-01T00:00:00Z' }] });
  const merged = mergeWorkspaceState(local, remote);
  assert.equal(merged.clients[0].company, 'Nuevo');
});

test('mergeWorkspaceState prioriza planChecks locales sobre remotos en caso de conflicto de claves', () => {
  const local = baseState({ planChecks: { q1: true } });
  const remote = baseState({ planChecks: { q1: false, q2: true } });
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.planChecks, { q1: true, q2: true });
});

// --- workspaceStatesEqual ---

test('workspaceStatesEqual es true para dos estados con los mismos datos en distinto orden', () => {
  const stateA = baseState({ clients: [{ id: 'c1', company: 'A' }, { id: 'c2', company: 'B' }] });
  const stateB = baseState({ clients: [{ id: 'c2', company: 'B' }, { id: 'c1', company: 'A' }] });
  assert.equal(workspaceStatesEqual(stateA, stateB), true);
});

test('workspaceStatesEqual es false cuando un registro difiere', () => {
  const stateA = baseState({ clients: [{ id: 'c1', company: 'A' }] });
  const stateB = baseState({ clients: [{ id: 'c1', company: 'B' }] });
  assert.equal(workspaceStatesEqual(stateA, stateB), false);
});

test('workspaceStatesEqual es true para dos estados vacíos', () => {
  assert.equal(workspaceStatesEqual(baseState(), baseState()), true);
});
