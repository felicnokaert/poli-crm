import test from 'node:test';
import assert from 'node:assert/strict';
import { addInteractionOnce, groupConversationHistory } from '../src/conversation-history.mjs';

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

test('merges duplicate client ids when the company is the same', () => {
  const result = groupConversationHistory([
    { id: 'one', clientId: 'imported', company: 'Poliuretanos Alcar', contact: 'Flor Vallejos', createdAt: '2026-09-01T10:00:00Z' },
    { id: 'two', clientId: 'whatsapp', company: '  POLIURETANOS ALCAR ', contact: 'Flor Vallejos', createdAt: '2026-09-01T11:00:00Z' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].messageCount, 2);
  assert.deepEqual(result[0].clientIds.sort(), ['imported', 'whatsapp']);
});

test('does not create a second history record for the same WhatsApp event', () => {
  const first = { id: 'first', sourceEventId: 'wa-1', summary: 'Hola' };
  const repeated = { id: 'second', sourceEventId: 'wa-1', summary: 'Hola confirmado' };
  const result = addInteractionOnce([first], repeated);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'first');
  assert.equal(result[0].summary, 'Hola confirmado');
});
