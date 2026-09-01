import test from 'node:test';
import assert from 'node:assert/strict';
import { groupConversationHistory } from '../src/conversation-history.mjs';

test('groups commercial history into one row per client', () => {
  const result = groupConversationHistory([
    { id: 'one', clientId: 'client-a', company: 'Empresa A', summary: 'Primera', createdAt: '2026-09-01T10:00:00Z' },
    { id: 'two', clientId: 'client-a', company: 'Empresa A', summary: 'Segunda', createdAt: '2026-09-01T11:00:00Z' },
    { id: 'three', clientId: 'client-b', company: 'Empresa B', summary: 'Otra', createdAt: '2026-09-01T09:00:00Z' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].company, 'Empresa A');
  assert.equal(result[0].summary, 'Segunda');
  assert.equal(result[0].messageCount, 2);
});

test('falls back to normalized company for legacy records without client id', () => {
  const result = groupConversationHistory([
    { id: 'one', company: 'Poliuretanos Alcar', createdAt: '2026-09-01T10:00:00Z' },
    { id: 'two', company: '  POLIURETANOS   ALCAR ', createdAt: '2026-09-01T11:00:00Z' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].messageCount, 2);
});
