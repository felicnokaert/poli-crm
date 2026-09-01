import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeWorkspaceState, workspaceStatesEqual } from '../src/workspace.mjs';
import { filterDismissedEvents, isLegacyWhatsAppPreview, isTrustedWhatsAppEvent } from '../src/whatsapp-events.mjs';

test('hides legacy browser previews that could mix chat names and senders', () => {
  assert.equal(isTrustedWhatsAppEvent({ event_id: 'bridge.legacyhash' }), false);
  assert.equal(isTrustedWhatsAppEvent({ event_id: 'bridge.open.safehash' }), true);
  assert.equal(isTrustedWhatsAppEvent({ event_id: 'wamid.official' }), true);
  assert.equal(isLegacyWhatsAppPreview({ event_id: 'bridge.legacyhash' }), true);
  assert.equal(isLegacyWhatsAppPreview({ event_id: 'bridge.open.safehash' }), false);
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
