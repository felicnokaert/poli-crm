import assert from 'node:assert/strict';
import test from 'node:test';
import { blankTriage, scoreTriage, suggestTriage } from '../src/commercial-triage.mjs';

test('keeps unknown triage variables explicit and never inflates priority', () => {
  assert.deepEqual(scoreTriage(blankTriage()), { score: 0, known: 0, total: 6, complete: false, priority: 'Sin confirmar' });
});

test('uses the approved 0-12 priority thresholds only when triage is complete', () => {
  assert.equal(scoreTriage({ relevance: 2, exposure: 2, problem: 2, urgency: 1, ticket: 1, activity: 2 }).priority, 'A');
  assert.equal(scoreTriage({ relevance: 1, exposure: 1, problem: 1, urgency: 1, ticket: 1, activity: 1 }).priority, 'B');
  assert.equal(scoreTriage({ relevance: 1, exposure: 0, problem: 1, urgency: 0, ticket: 0, activity: 1 }).priority, 'C');
});

test('prefills only triage signals evidenced by the inbound message', () => {
  const values = suggestTriage({ text_body: 'Necesito precio y stock urgente para esta semana' });
  assert.equal(values.problem, 2);
  assert.equal(values.urgency, 2);
  assert.equal(values.activity, 2);
  assert.equal(values.ticket, null);
  assert.equal(values.exposure, null);
});

test('relationship can establish relevance without guessing the other variables', () => {
  const values = suggestTriage({ text_body: 'Hola' }, 'Prospecto');
  assert.equal(values.relevance, 2);
  assert.equal(values.problem, null);
});
