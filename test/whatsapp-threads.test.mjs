import test from 'node:test';
import assert from 'node:assert/strict';
import { groupWhatsAppThreads, whatsappContactKey } from '../src/whatsapp-threads.mjs';

test('uses one contact identity across General and Penosil', () => {
  assert.equal(whatsappContactKey({ channel: 'general', customer_wa_id: 'Juan' }), whatsappContactKey({ channel: 'penosil', customer_wa_id: 'juan' }));
});

test('groups one contact into one thread while preserving its channels', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'one', channel: 'general', customer_wa_id: 'cliente', text_body: 'Hola', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'two', channel: 'penosil', customer_wa_id: 'cliente', text_body: 'EasySpray', occurred_at: '2026-09-01T10:01:00Z', classification_status: 'pending' },
  ]);
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0].channels, ['general', 'penosil']);
  assert.equal(threads[0].messageCount, 2);
});

test('collapses an identical bridge capture attributed to both channels', () => {
  const base = { direction: 'inbound', customer_wa_id: 'cliente', customer_name: 'Cliente', text_body: 'Mismo mensaje', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' };
  const threads = groupWhatsAppThreads([
    { ...base, event_id: 'bridge.open.a', channel: 'general' },
    { ...base, event_id: 'bridge.open.b', channel: 'penosil' },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].messageCount, 1);
  assert.equal(threads[0].channel, 'general');
  assert.equal(threads[0].channelConflict, true);
});

test('replaces unread preview with real messages after opening the chat', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'preview', channel: 'penosil', customer_wa_id: 'cliente', message_type: 'verified_unread_preview', text_body: '2 mensajes no leídos', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'real', channel: 'penosil', customer_wa_id: 'cliente', message_type: 'text', text_body: 'Quiero conocer el precio', occurred_at: '2026-09-01T10:01:00Z', classification_status: 'pending' },
  ]);
  assert.equal(threads[0].messageCount, 1);
  assert.equal(threads[0].text_body, 'Quiero conocer el precio');
});
