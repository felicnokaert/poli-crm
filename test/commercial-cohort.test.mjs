import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommercialCohort } from '../src/commercial-cohort.js';

test('builds the 34-account operational cohort with deterministic links', () => {
  const cohort = buildCommercialCohort();
  assert.equal(cohort.clients.length, 34);
  assert.equal(cohort.tasks.length, 34);
  assert.equal(new Set(cohort.clients.map((item) => item.id)).size, 34);
  assert.ok(cohort.tasks.every((task) => cohort.clients.some((client) => client.id === task.clientId)));
  assert.ok(cohort.clients.every((client) => client.source.includes('Seguimiento')));
});
