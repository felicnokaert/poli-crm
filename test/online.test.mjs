import assert from 'node:assert/strict';
import test from 'node:test';
import { completeTasksThrough, consolidateDuplicateClients, mergeWorkspaceState, workspaceStatesEqual } from '../src/workspace.mjs';
import { filterDismissedEvents, isLegacyWhatsAppPreview, isLowSignalWhatsAppEvent, isTrustedWhatsAppEvent } from '../src/whatsapp-events.mjs';

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
