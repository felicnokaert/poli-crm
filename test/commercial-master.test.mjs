import assert from 'node:assert/strict';
import test from 'node:test';
import { commercialMasterStats, mergeCommercialMaster } from '../src/commercial-master.js';

test('commercial master contains the reconciled editable universe', () => {
  const stats = commercialMasterStats();
  assert.equal(stats.total, 982);
  assert.equal(stats.sourceRows, 984);
  assert.ok(stats.historical > 700);
  assert.ok(stats.active > 150);
});

test('master import is idempotent and preserves user edits', () => {
  const first = mergeCommercialMaster({ clients: [{ id: 'custom', company: 'Argenpur', family: 'Poliurea', stage: 'Negociación' }], interactions: [], tasks: [], inbox: [] });
  const argenpur = first.state.clients.find((item) => item.company === 'Argenpur');
  assert.equal(argenpur.family, 'Poliurea');
  assert.equal(argenpur.stage, 'Negociación');
  assert.equal(first.state.clients.length, 982);
  const second = mergeCommercialMaster(first.state);
  assert.equal(second.skipped, true);
  assert.equal(second.state, first.state);
});
