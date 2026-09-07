import test from 'node:test';
import assert from 'node:assert/strict';
import { findStaleHotLeads } from '../src/hot-leads-radar.mjs';

test('flags an urgent commercial message left unclassified for too long', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000001', customer_name: 'Cliente Urgente', text_body: 'Necesito el precio para hoy, cuántos kg tienen en stock?', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findStaleHotLeads(inbox, { today: new Date('2026-09-05') });
  assert.equal(result.length, 1);
  assert.equal(result[0].customer, 'Cliente Urgente');
  assert.equal(result[0].daysSince, 4);
});

test('does not flag a message that is only urgent or only commercial, not both', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000002', customer_name: 'Solo Urgente', text_body: 'Ese tema lo vemos mañana sin falta', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'e2', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000003', customer_name: 'Solo Precio', text_body: 'Cuál es el precio del kit?', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findStaleHotLeads(inbox, { today: new Date('2026-09-05') });
  assert.equal(result.length, 0);
});

test('respects the minimum-days threshold so a fresh hot message is not flagged yet', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000004', customer_name: 'Recien Llegado', text_body: 'Necesito precio urgente para hoy, cuántas unidades hay en stock?', occurred_at: '2026-09-04T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findStaleHotLeads(inbox, { today: new Date('2026-09-05'), minDays: 2 });
  assert.equal(result.length, 0);
});

test('ignores events already classified (no longer pending)', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000005', customer_name: 'Ya Atendido', text_body: 'Necesito precio urgente para hoy, cuántas unidades hay en stock?', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'confirmed' },
  ];
  const result = findStaleHotLeads(inbox, { today: new Date('2026-09-05') });
  assert.equal(result.length, 0);
});

test('only considers the most recent message per contact', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000006', customer_name: 'Repetido', text_body: 'Hola', occurred_at: '2026-08-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'e2', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000006', customer_name: 'Repetido', text_body: 'Necesito precio urgente para hoy, cuántas unidades hay en stock?', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findStaleHotLeads(inbox, { today: new Date('2026-09-05') });
  assert.equal(result.length, 1);
  assert.equal(result[0].eventId, 'e2');
});
