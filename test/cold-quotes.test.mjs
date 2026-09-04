import test from 'node:test';
import assert from 'node:assert/strict';
import { findColdQuotes } from '../src/cold-quotes.mjs';

test('flags a quote request with no later sale from that contact', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000001', customer_name: 'Cliente Frio', text_body: 'Cuánto sale el kit de poliuretano?', occurred_at: '2026-08-01T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findColdQuotes(inbox, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 1);
  assert.equal(result[0].customer, 'Cliente Frio');
  assert.ok(result[0].daysSince >= 40);
});

test('does not flag a quote that converted into a sale afterward', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000002', customer_name: 'Cliente Caliente', text_body: 'Precio del kit?', occurred_at: '2026-08-01T10:00:00Z', classification_status: 'pending' },
  ];
  const sales = [{ customer: 'Cliente Caliente', date: '2026-08-05' }];
  const result = findColdQuotes(inbox, sales, { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('ignores messages that are not price/quote intent', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000003', customer_name: 'Solo Info', text_body: 'Hola, quiero más información', occurred_at: '2026-08-01T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findColdQuotes(inbox, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 0);
});

test('respects the minimum-days threshold so recent quotes are not flagged yet', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000004', customer_name: 'Recien', text_body: 'Cuánto cuesta?', occurred_at: '2026-09-10T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findColdQuotes(inbox, [], { today: new Date('2026-09-12'), minDays: 7 });
  assert.equal(result.length, 0);
});

test('only considers the most recent message per contact, not every quote line', () => {
  const inbox = [
    { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000005', customer_name: 'Repetido', text_body: 'Cuánto sale?', occurred_at: '2026-08-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'e2', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000005', customer_name: 'Repetido', text_body: 'Y el precio del otro modelo?', occurred_at: '2026-08-10T10:00:00Z', classification_status: 'pending' },
  ];
  const result = findColdQuotes(inbox, [], { today: new Date('2026-09-15') });
  assert.equal(result.length, 1);
  assert.equal(result[0].eventId, 'e2');
});
