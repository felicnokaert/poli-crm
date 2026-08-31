import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommercialCohort, mergeCommercialCohort } from '../src/commercial-cohort.js';

test('builds the 34-account operational cohort with deterministic links', () => {
  const cohort = buildCommercialCohort();
  assert.equal(cohort.clients.length, 34);
  assert.equal(cohort.tasks.length, 34);
  assert.equal(new Set(cohort.clients.map((item) => item.id)).size, 34);
  assert.ok(cohort.tasks.every((task) => cohort.clients.some((client) => client.id === task.clientId)));
  assert.ok(cohort.clients.every((client) => client.source.includes('Seguimiento')));
});

test('adds only missing companies and preserves existing commercial history', () => {
  const existing = { clients: [{ id: 'real', company: 'Argenpur', stage: 'Negociación' }], interactions: [{ id: 'i1' }], tasks: [], inbox: [] };
  const first = mergeCommercialCohort(existing);
  assert.equal(first.addedClients, 33);
  assert.equal(first.state.clients.find((item) => item.company === 'Argenpur').stage, 'Negociación');
  assert.deepEqual(first.state.interactions, existing.interactions);
  const second = mergeCommercialCohort(first.state);
  assert.equal(second.addedClients, 0);
  assert.equal(second.state, first.state);
});
