import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeClients, recordDuplicateReviewDecision, undoClientMerge } from '../src/workspace.mjs';

function baseState(overrides = {}) {
  return {
    clients: [
      { id: 'a', company: 'Herrería El Progreso', temperature: 'Caliente', contacts: [{ name: 'Marcos', phone: '1140001111' }] },
      { id: 'b', company: 'Herreria El Progreso SRL', temperature: 'Tibio', contacts: [{ name: 'Marcos', phone: '1140002222' }] },
    ],
    interactions: [{ id: 'i1', clientId: 'b', text: 'hola' }],
    tasks: [{ id: 't1', clientId: 'b', title: 'llamar' }],
    opportunities: [{ id: 'o1', clientId: 'b', product: 'PU' }],
    deletedRecordIds: {},
    mergeLogs: [],
    ...overrides,
  };
}

test('mergeClients keeps survivor id, migrates history and unions contacts', () => {
  const next = mergeClients(baseState(), 'a', 'b', { actor: 'felipe@poliplast.com' });
  assert.deepEqual(next.clients.map((c) => c.id), ['a']);
  assert.equal(next.clients[0].temperature, 'Caliente');
  assert.equal(next.clients[0].contacts.length, 2);
  assert.deepEqual(next.interactions.map((i) => i.clientId), ['a']);
  assert.deepEqual(next.tasks.map((t) => t.clientId), ['a']);
  assert.deepEqual(next.opportunities.map((o) => o.clientId), ['a']);
  assert.deepEqual(next.deletedRecordIds.clients, ['b']);
  assert.equal(next.mergeLogs.length, 1);
  assert.equal(next.mergeLogs[0].ejecutadoPor, 'felipe@poliplast.com');
  assert.equal(next.mergeLogs[0].deshecho, false);
});

test('mergeClients records which fields conflicted, but caller decides them, not the function', () => {
  const next = mergeClients(baseState(), 'a', 'b', { conflictFields: ['temperature'] });
  assert.deepEqual(next.mergeLogs[0].camposConflicto, ['temperature']);
});

test('undoClientMerge restores both clients and rewires history back, without touching unrelated records', () => {
  const merged = mergeClients(baseState({
    interactions: [{ id: 'i1', clientId: 'b', text: 'hola' }, { id: 'i2', clientId: 'a', text: 'ya era del sobreviviente' }],
  }), 'a', 'b');
  const logId = merged.mergeLogs[0].id;
  const restored = undoClientMerge(merged, logId);
  assert.deepEqual(restored.clients.map((c) => c.id).sort(), ['a', 'b']);
  assert.equal(restored.clients.find((c) => c.id === 'a').temperature, 'Caliente');
  assert.equal(restored.clients.find((c) => c.id === 'b').temperature, 'Tibio');
  assert.equal(restored.interactions.find((i) => i.id === 'i1').clientId, 'b');
  assert.equal(restored.interactions.find((i) => i.id === 'i2').clientId, 'a');
  assert.equal(restored.deletedRecordIds.clients.includes('b'), false);
  assert.equal(restored.mergeLogs[0].deshecho, true);
});

test('undoClientMerge is a no-op for an already-undone or unknown mergeLog', () => {
  const merged = mergeClients(baseState(), 'a', 'b');
  const logId = merged.mergeLogs[0].id;
  const undone = undoClientMerge(merged, logId);
  const twice = undoClientMerge(undone, logId);
  assert.deepEqual(twice, undone);
  assert.deepEqual(undoClientMerge(baseState(), 'nope'), baseState());
});

test('recordDuplicateReviewDecision guarda la decisión y sobreescribe una previa del mismo par', () => {
  const state = recordDuplicateReviewDecision(baseState(), 'a::b', 'postponed', {
    actor: 'felipe@poliplast.com',
    signalsAtDecision: ['company_name_exact'],
  });
  assert.equal(state.duplicateReviewDecisions.length, 1);
  assert.equal(state.duplicateReviewDecisions[0].id, 'a::b');
  assert.equal(state.duplicateReviewDecisions[0].decision, 'postponed');
  assert.equal(state.duplicateReviewDecisions[0].decidedBy, 'felipe@poliplast.com');
  assert.deepEqual(state.duplicateReviewDecisions[0].signalsAtDecision, ['company_name_exact']);

  const updated = recordDuplicateReviewDecision(state, 'a::b', 'not_duplicate', { signalsAtDecision: ['company_name_exact', 'cuit_exact'] });
  assert.equal(updated.duplicateReviewDecisions.length, 1);
  assert.equal(updated.duplicateReviewDecisions[0].decision, 'not_duplicate');
});

test('recordDuplicateReviewDecision es un no-op sin pairId o con una decisión desconocida', () => {
  const state = baseState();
  assert.deepEqual(recordDuplicateReviewDecision(state, '', 'postponed'), state);
  assert.deepEqual(recordDuplicateReviewDecision(state, 'a::b', 'algo_raro'), state);
});
