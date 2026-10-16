import test from 'node:test';
import assert from 'node:assert/strict';
import { canUndoMerge, mergeClients, mergeUndoDaysLeft, undoClientMerge } from '../src/workspace.mjs';

const base = () => ({
  clients: [{ id: 'a', company: 'Corralón Sur', updatedAt: '1' }, { id: 'b', company: 'Corralon Sur SRL', updatedAt: '1' }],
  interactions: [], tasks: [], opportunities: [], mergeLogs: [],
});

test('una fusión se puede deshacer durante 7 días y después ya no', () => {
  const merged = mergeClients(base(), 'a', 'b');
  const log = merged.mergeLogs.at(-1);
  const when = new Date(log.fecha);
  const day6 = new Date(when.getTime() + 6 * 86400000);
  const day8 = new Date(when.getTime() + 8 * 86400000);
  assert.equal(canUndoMerge(log, day6), true);
  assert.equal(mergeUndoDaysLeft(log, day6), 1);
  assert.equal(canUndoMerge(log, day8), false);
  assert.equal(undoClientMerge(merged, log.id, day8), merged, 'pasada la semana queda firme');
  assert.equal(undoClientMerge(merged, log.id, day6).clients.length, 2);
});
