import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_MASTER_CLIENTS } from '../lib/commercial-master-data.mjs';
import { mergeCommercialMaster } from '../src/commercial-master.js';

test('commercial master contains the reconciled editable universe', () => {
  const result = mergeCommercialMaster({ clients: [] }, COMMERCIAL_MASTER_CLIENTS);
  assert.equal(result.state.clients.length, 982);
  assert.equal(COMMERCIAL_MASTER_CLIENTS.length, 984);
  assert.ok(result.state.clients.filter((item) => item.sourceType === 'Cliente histórico').length > 700);
  assert.ok(result.state.clients.every((item) => item.pipelineActive === false));
});

test('master import is idempotent and preserves user edits', () => {
  const first = mergeCommercialMaster({ clients: [{ id: 'custom', company: 'Argenpur', family: 'Poliurea', stage: 'Negociación' }], interactions: [], tasks: [], inbox: [] }, COMMERCIAL_MASTER_CLIENTS);
  const argenpur = first.state.clients.find((item) => item.company === 'Argenpur');
  assert.equal(argenpur.family, 'Poliurea');
  assert.equal(argenpur.stage, 'Negociación');
  assert.equal(first.state.clients.length, 982);
  const second = mergeCommercialMaster(first.state, COMMERCIAL_MASTER_CLIENTS);
  assert.equal(second.skipped, true);
  assert.equal(second.state, first.state);
});
