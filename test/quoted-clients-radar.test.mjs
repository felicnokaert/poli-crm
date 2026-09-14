import test from 'node:test';
import assert from 'node:assert/strict';
import { findExpiredQuotes } from '../src/quoted-clients-radar.mjs';

test('flags an open client whose quote is older than minDays with no sale after it', () => {
  const clients = [{ id: 'c1', company: 'Cotizado Hace Rato SA', outcome: 'Abierto', lastQuotedAt: '2026-08-01T10:00:00Z' }];
  const result = findExpiredQuotes(clients, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 1);
  assert.equal(result[0].clientId, 'c1');
  assert.ok(result[0].daysSince >= 15);
});

test('does not flag a client with no lastQuotedAt marked', () => {
  const clients = [{ id: 'c1', company: 'Nunca Cotizado SA', outcome: 'Abierto' }];
  const result = findExpiredQuotes(clients, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('does not flag a client with a sale registered after the quote', () => {
  const clients = [{ id: 'c1', company: 'Convertido SA', outcome: 'Abierto', lastQuotedAt: '2026-08-01T10:00:00Z' }];
  const sales = [{ customer: 'Convertido SA', date: '2026-08-10' }];
  const result = findExpiredQuotes(clients, sales, { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('ignores clients whose outcome is not Abierto', () => {
  const clients = [{ id: 'c1', company: 'Ganado SA', outcome: 'Ganado', lastQuotedAt: '2026-08-01T10:00:00Z' }];
  const result = findExpiredQuotes(clients, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('respects the minimum-days threshold so a recent quote is not flagged yet', () => {
  const clients = [{ id: 'c1', company: 'Recien Cotizado SA', outcome: 'Abierto', lastQuotedAt: '2026-09-10T10:00:00Z' }];
  const result = findExpiredQuotes(clients, [], { today: new Date('2026-09-15'), minDays: 15 });
  assert.equal(result.length, 0);
});

test('sorts results by days since the quote, most overdue first', () => {
  const clients = [
    { id: 'c1', company: 'Menos Vencido SA', outcome: 'Abierto', lastQuotedAt: '2026-08-15T10:00:00Z' },
    { id: 'c2', company: 'Mas Vencido SA', outcome: 'Abierto', lastQuotedAt: '2026-07-01T10:00:00Z' },
  ];
  const result = findExpiredQuotes(clients, [], { today: new Date('2026-09-15') });
  assert.deepEqual(result.map((item) => item.clientId), ['c2', 'c1']);
});
