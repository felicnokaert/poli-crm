import assert from 'node:assert/strict';
import test from 'node:test';
import { completeTasksThrough, consolidateDuplicateClients, mergeWorkspaceState, recordDeletions, validateWorkspaceStateShape, workspaceStatesEqual } from '../src/workspace.mjs';
import { filterDismissedEvents, isLegacyWhatsAppPreview, isLowSignalWhatsAppEvent, isTrustedWhatsAppEvent } from '../src/whatsapp-events.mjs';

const REALISTIC_STATE = {
  clients: [
    { id: 'a', company: 'Báltico Construcciones', temperature: 'Caliente', updatedAt: '2026-09-01' },
    { id: 'b', company: 'Carrocería Argentina', temperature: 'Tibio', updatedAt: '2026-09-02' },
  ],
  interactions: [{ id: 'i1', clientId: 'a' }],
  tasks: [{ id: 't1', clientId: 'a', done: false }],
  inbox: [{ event_id: 'w1' }],
  opportunities: [{ id: 'o1', title: 'Cotización' }],
  sales: [{ id: 's1', total: 1000 }],
  dismissedInboxEventIds: ['old-1'],
  ignoredWhatsAppContacts: [],
  boardLists: [],
  boardCards: [],
  salesGoals: [],
  businessUnits: [],
  mergeLogs: [],
  duplicateReviewDecisions: [],
  deletedRecordIds: {},
  planChecks: {},
  commercialMasterVersion: '',
  historyResetVersion: '',
  tasksClosedThrough: '',
  primaryChannel: 'general',
  profileName: 'Felipe',
};

test('validateWorkspaceStateShape acepta un estado real bien formado sin lanzar', () => {
  assert.doesNotThrow(() => validateWorkspaceStateShape(REALISTIC_STATE));
});

test('validateWorkspaceStateShape acepta el estado vacío inicial de una cuenta nueva', () => {
  assert.doesNotThrow(() => validateWorkspaceStateShape({ clients: [], interactions: [], tasks: [], inbox: [], opportunities: [], sales: [], dismissedInboxEventIds: [], ignoredWhatsAppContacts: [], deletedRecordIds: {}, boardLists: [], boardCards: [], salesGoals: [], planChecks: {}, businessUnits: [], mergeLogs: [], duplicateReviewDecisions: [] }));
});

test('validateWorkspaceStateShape acepta campos ausentes (no exige todas las claves)', () => {
  assert.doesNotThrow(() => validateWorkspaceStateShape({ clients: [{ id: 'a', company: 'X' }] }));
});

test('validateWorkspaceStateShape rechaza data undefined o no-objeto', () => {
  assert.throws(() => validateWorkspaceStateShape(undefined), /objeto/);
  assert.throws(() => validateWorkspaceStateShape('oops'), /objeto/);
  assert.throws(() => validateWorkspaceStateShape(['no']), /objeto/);
});

test('validateWorkspaceStateShape rechaza clients undefined en vez de array', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, clients: undefined }), /clients.*array/);
});

test('validateWorkspaceStateShape rechaza clients como string en vez de array', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, clients: 'not-an-array' }), /clients.*array/);
});

test('validateWorkspaceStateShape rechaza clients como objeto en vez de array', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, clients: { id: 'a' } }), /clients.*array/);
});

test('validateWorkspaceStateShape rechaza tasks como objeto en vez de array', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, tasks: {} }), /tasks.*array/);
});

test('validateWorkspaceStateShape rechaza un cliente sin id', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, clients: [{ company: 'Sin ID' }] }), /clients\[0\].*id/);
});

test('validateWorkspaceStateShape rechaza un cliente sin company', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, clients: [{ id: 'a' }] }), /clients\[0\].*company/);
});

test('validateWorkspaceStateShape rechaza un cliente que no es un objeto', () => {
  assert.throws(() => validateWorkspaceStateShape({ ...REALISTIC_STATE, clients: ['not-a-client'] }), /clients\[0\]/);
});

test('consolidates duplicate company cards and rewires their history to one commercial identity', () => {
  const result = consolidateDuplicateClients({
    clients: [
      { id: 'old', company: 'Báltico Construcciones', temperature: 'Frío', updatedAt: '2026-09-01' },
      { id: 'new', company: 'BALTICO CONSTRUCCIONES', temperature: 'Caliente', updatedAt: '2026-09-02' },
    ],
    interactions: [{ id: 'i1', clientId: 'old' }], tasks: [{ id: 't1', clientId: 'old' }], opportunities: [], inbox: [],
  });
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].temperature, 'Caliente');
  assert.equal(result.interactions[0].clientId, 'new');
  assert.equal(result.tasks[0].clientId, 'new');
});

test('does not merge different client records by company name during synchronization', () => {
  const merged = mergeWorkspaceState(
    {
      clients: [{ id: 'web', company: 'Carrocería Argentina', temperature: 'Caliente', updatedAt: '2026-09-09T10:00:00Z' }],
      interactions: [], tasks: [], opportunities: [], inbox: [],
    },
    {
      clients: [{ id: 'phone', company: 'CARROCERIA ARGENTINA', temperature: 'Tibio', updatedAt: '2026-09-09T11:00:00Z' }],
      interactions: [], tasks: [], opportunities: [], inbox: [],
    },
  );
  assert.deepEqual(merged.clients.map((item) => item.id), ['phone', 'web']);
  assert.deepEqual(merged.clients.map((item) => item.temperature), ['Tibio', 'Caliente']);
});

test('identifies reactions, unsupported events and automatic away replies as low-signal', () => {
  assert.equal(isLowSignalWhatsAppEvent({ message_type: 'reaction', text_body: '[reaction]' }), true);
  assert.equal(isLowSignalWhatsAppEvent({ text_body: '[unsupported]' }), true);
  assert.equal(isLowSignalWhatsAppEvent({ text_body: 'Gracias por comunicarte con ARGENPLAST. Nuestro horario es de 07:00 a 12:00. Tan pronto como leamos tu mensaje responderemos.' }), true);
  assert.equal(isLowSignalWhatsAppEvent({ text_body: 'Necesito precio del kit para hoy' }), false);
});

test('completes every due task through an authorized cutoff exactly once', () => {
  const result = completeTasksThrough({
    tasks: [
      { id: 'old', dueDate: '2026-09-08', done: false },
      { id: 'cutoff', dueDate: '2026-09-09', done: false },
      { id: 'undated-old', dueDate: '', createdAt: '2026-08-27T12:00:00Z', done: false },
      { id: 'future', dueDate: '2026-09-10', done: false },
    ],
    tasksClosedThrough: '',
  }, '2026-09-09');
  assert.equal(result.tasks.find((item) => item.id === 'old').done, true);
  assert.equal(result.tasks.find((item) => item.id === 'cutoff').done, true);
  assert.equal(result.tasks.find((item) => item.id === 'undated-old').done, true);
  assert.equal(result.tasks.find((item) => item.id === 'future').done, false);
  assert.equal(result.tasksClosedThrough, '2026-09-09');
  assert.equal(completeTasksThrough(result, '2026-09-09'), result);
});

test('hides legacy browser previews that could mix chat names and senders', () => {
  assert.equal(isTrustedWhatsAppEvent({ event_id: 'bridge.legacyhash' }), false);
  assert.equal(isTrustedWhatsAppEvent({ event_id: 'bridge.open.safehash' }), true);
  assert.equal(isTrustedWhatsAppEvent({ event_id: 'wamid.official' }), true);
  assert.equal(isLegacyWhatsAppPreview({ event_id: 'bridge.legacyhash' }), true);
  assert.equal(isLegacyWhatsAppPreview({ event_id: 'bridge.open.safehash' }), false);
});

test('quarantines Penosil captures made by bridge versions older than 0.17', () => {
  const oldPenosil = { event_id: 'bridge.open.old', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', raw_payload: { bridge_version: '0.16.0' } };
  const currentPenosil = { ...oldPenosil, event_id: 'bridge.open.current', raw_payload: { bridge_version: '0.17.0' } };
  const official = { event_id: 'wamid.official', channel: 'penosil', phone_number_id: 'real-phone-id' };
  assert.equal(isLegacyWhatsAppPreview(oldPenosil), true);
  assert.equal(isLegacyWhatsAppPreview(currentPenosil), false);
  assert.equal(isLegacyWhatsAppPreview(official), false);
});

test('keeps deleted CRM messages dismissed without hiding future messages from the same contact', () => {
  const events = [
    { event_id: 'old-1', customer_wa_id: '54911' },
    { event_id: 'new-2', customer_wa_id: '54911' },
  ];
  assert.deepEqual(filterDismissedEvents(events, ['old-1']).map((item) => item.event_id), ['new-2']);
});

test('does not resurrect dismissed events during workspace synchronization', () => {
  const merged = mergeWorkspaceState(
    { inbox: [], dismissedInboxEventIds: ['deleted-1'] },
    { inbox: [{ event_id: 'deleted-1' }, { event_id: 'future-2' }], dismissedInboxEventIds: [] },
  );
  assert.deepEqual(merged.inbox.map((item) => item.event_id), ['future-2']);
  assert.deepEqual(merged.dismissedInboxEventIds, ['deleted-1']);
});

test('does not resurrect commercial history after an authorized reset', () => {
  const merged = mergeWorkspaceState(
    { interactions: [], historyResetVersion: '2026-09-03T16:00:00.000Z' },
    { interactions: [{ id: 'old-history', createdAt: '2026-09-01T10:00:00Z' }] },
  );
  assert.deepEqual(merged.interactions, []);
  assert.equal(merged.historyResetVersion, '2026-09-03T16:00:00.000Z');
});

test('removes obsolete unread counters while keeping real WhatsApp messages', () => {
  const merged = mergeWorkspaceState(
    { inbox: [{ event_id: 'counter', message_type: 'verified_unread_preview' }], dismissedInboxEventIds: [] },
    { inbox: [{ event_id: 'real', message_type: 'text', text_body: 'Necesito precio' }], dismissedInboxEventIds: [] },
  );
  assert.deepEqual(merged.inbox.map((item) => item.event_id), ['real']);
});

test('keeps non-commercial WhatsApp contact rules across workspace synchronization', () => {
  const merged = mergeWorkspaceState(
    { ignoredWhatsAppContacts: [{ key: 'penosil:familia', category: 'Familiar / personal', updatedAt: '2026-09-01T10:00:00Z' }] },
    { ignoredWhatsAppContacts: [{ key: 'general:equipo', category: 'Equipo interno', updatedAt: '2026-09-01T09:00:00Z' }] },
  );
  assert.deepEqual(merged.ignoredWhatsAppContacts.map((item) => item.key), ['general:equipo', 'penosil:familia']);
});

test('workspace synchronization preserves board, sales configuration and profile data', () => {
  const merged = mergeWorkspaceState(
    {
      boardLists: [{ id: 'list-local', title: 'Prioridad semanal', updatedAt: '2026-09-10T10:00:00Z' }],
      boardCards: [{ id: 'card-local', listId: 'list-local', title: 'Llamar', updatedAt: '2026-09-10T10:00:00Z' }],
      salesGoals: [{ id: 'goal-local', target: 10, updatedAt: '2026-09-10T10:00:00Z' }],
      businessUnits: [{ id: 'poliplast', name: 'Poliplast', updatedAt: '2026-09-10T10:00:00Z' }],
      primaryChannel: 'penosil',
      profileName: 'Felipe',
    },
    {
      boardLists: [{ id: 'list-remote', title: 'Backlog', updatedAt: '2026-09-10T09:00:00Z' }],
      boardCards: [], salesGoals: [], businessUnits: [], primaryChannel: '', profileName: '',
    },
  );
  assert.deepEqual(merged.boardLists.map((item) => item.id), ['list-local', 'list-remote']);
  assert.equal(merged.boardCards[0].id, 'card-local');
  assert.equal(merged.salesGoals[0].id, 'goal-local');
  assert.equal(merged.businessUnits[0].id, 'poliplast');
  assert.equal(merged.primaryChannel, 'penosil');
  assert.equal(merged.profileName, 'Felipe');
});

test('synchronized deletion tombstones prevent old remote records from reappearing', () => {
  const local = recordDeletions(
    { clients: [], tasks: [], deletedRecordIds: {} },
    { clients: ['client-1'], tasks: ['task-1'] },
  );
  const merged = mergeWorkspaceState(local, {
    clients: [{ id: 'client-1', company: 'Registro viejo' }],
    tasks: [{ id: 'task-1', title: 'Tarea vieja' }],
  });
  assert.deepEqual(merged.clients, []);
  assert.deepEqual(merged.tasks, []);
  assert.deepEqual(merged.deletedRecordIds.clients, ['client-1']);
  assert.deepEqual(merged.deletedRecordIds.tasks, ['task-1']);
});

test('merges concurrent workspace changes without dropping records', () => {
  const local = {
    clients: [{ id: 'a', company: 'Local', updatedAt: '2026-08-31T10:00:00Z' }],
    interactions: [{ id: 'i1', createdAt: '2026-08-31T10:00:00Z' }],
    tasks: [{ id: 't1', done: true, updatedAt: '2026-08-31T11:00:00Z' }],
    inbox: [{ event_id: 'w1', classification_status: 'confirmed', classifiedAt: '2026-08-31T11:00:00Z' }],
    opportunities: [{ id: 'o1', title: 'Cotización local', updatedAt: '2026-08-31T11:00:00Z' }],
  };
  const remote = {
    clients: [{ id: 'b', company: 'Remoto', updatedAt: '2026-08-31T10:30:00Z' }],
    interactions: [{ id: 'i2', createdAt: '2026-08-31T10:30:00Z' }],
    tasks: [{ id: 't1', done: false, updatedAt: '2026-08-31T10:30:00Z' }],
    inbox: [{ event_id: 'w1', classification_status: 'pending', occurred_at: '2026-08-31T09:00:00Z' }],
    opportunities: [{ id: 'o2', title: 'Pedido remoto', updatedAt: '2026-08-31T10:30:00Z' }],
  };
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.clients.map((item) => item.id).sort(), ['a', 'b']);
  assert.deepEqual(merged.interactions.map((item) => item.id).sort(), ['i1', 'i2']);
  assert.equal(merged.tasks[0].done, true);
  assert.equal(merged.inbox[0].classification_status, 'confirmed');
  assert.deepEqual(merged.opportunities.map((item) => item.id).sort(), ['o1', 'o2']);
});

test('recognizes equivalent workspace states regardless of record order', () => {
  const first = { clients: [{ id: 'b' }, { id: 'a' }], interactions: [], tasks: [], inbox: [] };
  const second = { clients: [{ id: 'a' }, { id: 'b' }], interactions: [], tasks: [], inbox: [] };
  assert.equal(workspaceStatesEqual(first, second), true);
});

test('detects a real remote workspace change', () => {
  const first = { clients: [{ id: 'a', stage: 'Nuevo', updatedAt: '1' }], interactions: [], tasks: [], inbox: [] };
  const second = { clients: [{ id: 'a', stage: 'Ganado', updatedAt: '2' }], interactions: [], tasks: [], inbox: [] };
  assert.equal(workspaceStatesEqual(first, second), false);
});
