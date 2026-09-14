import test from 'node:test';
import assert from 'node:assert/strict';
import { findStaleClients } from '../src/stale-clients-radar.mjs';

test('flags an open client with no sale, no message and no recent contact', () => {
  const clients = [{ id: 'c1', company: 'Silencio SRL', outcome: 'Abierto', createdAt: '2026-08-01T10:00:00Z' }];
  const result = findStaleClients(clients, [], [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 1);
  assert.equal(result[0].clientId, 'c1');
  assert.ok(result[0].daysSince >= 30);
});

test('does not flag a client with a recent sale', () => {
  const clients = [{ id: 'c1', company: 'Cliente Activo', outcome: 'Abierto', createdAt: '2026-06-01T10:00:00Z' }];
  const sales = [{ customer: 'Cliente Activo', date: '2026-09-10' }];
  const result = findStaleClients(clients, sales, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('does not flag a client with a recent WhatsApp message from a known contact', () => {
  const clients = [{ id: 'c1', company: 'Con Whatsapp', outcome: 'Abierto', createdAt: '2026-06-01T10:00:00Z', contacts: [{ id: 'k1', whatsappId: '5491100000009', primary: true }] }];
  const inbox = [{ customer_wa_id: '5491100000009', occurred_at: '2026-09-12T10:00:00Z' }];
  const result = findStaleClients(clients, [], inbox, { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('ignores clients whose outcome is not Abierto', () => {
  const clients = [
    { id: 'c1', company: 'Ganado SRL', outcome: 'Ganado', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'c2', company: 'Perdido SRL', outcome: 'Perdido', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'c3', company: 'Legacy Ganado', stage: 'Ganado', createdAt: '2026-01-01T10:00:00Z' },
  ];
  const result = findStaleClients(clients, [], [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('treats a client without an explicit outcome as open (default Abierto)', () => {
  const clients = [{ id: 'c1', company: 'Sin Resultado Fijado', createdAt: '2026-08-01T10:00:00Z' }];
  const result = findStaleClients(clients, [], [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 1);
});

test('respects the minimum-days threshold so recently created clients are not flagged yet', () => {
  const clients = [{ id: 'c1', company: 'Recien Cargado', outcome: 'Abierto', createdAt: '2026-09-10T10:00:00Z' }];
  const result = findStaleClients(clients, [], [], { today: new Date('2026-09-15'), minDays: 30 });
  assert.equal(result.length, 0);
});

test('omits a client with no reference date at all instead of guessing', () => {
  const clients = [{ id: 'c1', company: 'Sin Fecha', outcome: 'Abierto' }];
  const result = findStaleClients(clients, [], [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('sorts results by days since last activity, most stale first', () => {
  const clients = [
    { id: 'c1', company: 'Menos Viejo', outcome: 'Abierto', createdAt: '2026-08-01T10:00:00Z' },
    { id: 'c2', company: 'Mas Viejo', outcome: 'Abierto', createdAt: '2026-06-01T10:00:00Z' },
  ];
  const result = findStaleClients(clients, [], [], { today: new Date('2026-09-15') });
  assert.deepEqual(result.map((item) => item.clientId), ['c2', 'c1']);
});
