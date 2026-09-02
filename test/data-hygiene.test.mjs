import assert from 'node:assert/strict';
import test from 'node:test';
import { isExplicitTestRecord, removeExplicitTestData, testDataCandidates } from '../src/data-hygiene.mjs';

test('marks only explicit development fixtures as test data', () => {
  assert.equal(isExplicitTestRecord({ company: 'CLIENTE PRUEBA CLAUDE — ignorar' }), true);
  assert.equal(isExplicitTestRecord({ company: 'Test Number' }), true);
  assert.equal(isExplicitTestRecord({ company: 'Test Number', contact: 'Test Number' }), true);
  assert.equal(isExplicitTestRecord({ summary: 'Prueba técnica firmada del webhook. No es un cliente real.' }), true);
  assert.equal(isExplicitTestRecord({ company: 'Constructora Ficticia SRL' }), true);
  assert.equal(isExplicitTestRecord({ company: 'Consulta Penosil Demo' }), true);
  assert.equal(isExplicitTestRecord({ company: 'Pruebas Hidráulicas del Sur' }), false);
  assert.equal(isExplicitTestRecord({ company: 'Cliente real', summary: 'Quiere hacer una prueba del producto' }), false);
});

test('removes linked fixture records while preserving real customers', () => {
  const data = {
    clients: [{ id: 'fake', company: 'Test Number' }, { id: 'real', company: 'Cliente Real' }],
    interactions: [{ id: 'if', clientId: 'fake' }, { id: 'ir', clientId: 'real' }],
    tasks: [{ id: 'tf', clientId: 'fake' }, { id: 'tr', clientId: 'real' }],
    opportunities: [{ id: 'of', clientId: 'fake' }, { id: 'or', clientId: 'real' }],
    inbox: [{ event_id: 'wf', text_body: 'Prueba técnica Codex. No es un cliente real.' }, { event_id: 'wr', text_body: 'Necesito precio' }],
    dismissedInboxEventIds: [],
  };
  const candidates = testDataCandidates(data);
  assert.equal(candidates.clients.length, 1);
  const cleaned = removeExplicitTestData(data);
  assert.deepEqual(cleaned.clients.map((item) => item.id), ['real']);
  assert.deepEqual(cleaned.interactions.map((item) => item.id), ['ir']);
  assert.deepEqual(cleaned.tasks.map((item) => item.id), ['tr']);
  assert.deepEqual(cleaned.opportunities.map((item) => item.id), ['or']);
  assert.deepEqual(cleaned.inbox.map((item) => item.event_id), ['wr']);
  assert.deepEqual(cleaned.dismissedInboxEventIds, ['wf']);
});
