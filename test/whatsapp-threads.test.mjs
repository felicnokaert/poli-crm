import test from 'node:test';
import assert from 'node:assert/strict';
import { groupWhatsAppThreads, whatsappContactKey } from '../src/whatsapp-threads.mjs';

test('keeps one contact identity separate across General and Penosil', () => {
  assert.notEqual(whatsappContactKey({ channel: 'general', customer_wa_id: 'Juan' }), whatsappContactKey({ channel: 'penosil', customer_wa_id: 'juan' }));
});

test('does not mix a same-named contact from General and Penosil', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'one', channel: 'general', customer_wa_id: 'cliente', text_body: 'Hola', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'two', channel: 'penosil', customer_wa_id: 'cliente', text_body: 'EasySpray', occurred_at: '2026-09-01T10:01:00Z', classification_status: 'pending' },
  ]);
  assert.equal(threads.length, 2);
  assert.deepEqual(threads.map((item) => item.channel).sort(), ['general', 'penosil']);
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

test('deduplicates across channels before grouping when browser contact titles differ', () => {
  const source = 'wa:message-123';
  const threads = groupWhatsAppThreads([
    { event_id: 'bridge.open.general', channel: 'general', customer_wa_id: 'techo pu', customer_name: 'Techo PU', text_body: 'Necesito precio', occurred_at: '2026-09-03T10:00:00Z', classification_status: 'pending', raw_payload: { source_message_key: source } },
    { event_id: 'bridge.open.penosil', channel: 'penosil', customer_wa_id: 'techos poliuretano expandido', customer_name: 'Techos Poliuretano Expandido', text_body: 'Necesito precio', occurred_at: '2026-09-03T10:00:00Z', classification_status: 'pending', raw_payload: { source_message_key: source } },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].messageCount, 1);
  assert.equal(threads[0].channelConflict, true);
});

test('reconciles legacy mirrored browser captures conservatively', () => {
  const base = { direction: 'inbound', phone_number_id: 'browser-bridge:general', customer_wa_id: 'polymach', customer_name: 'polymach', occurred_at: '2026-09-03T10:24:00Z', classification_status: 'pending' };
  const threads = groupWhatsAppThreads([
    { ...base, event_id: 'old-general', channel: 'general', text_body: '[audio]' },
    { ...base, event_id: 'old-penosil', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', text_body: '[audio · 0:08]', occurred_at: '2026-09-03T10:24:05Z' },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].messageCount, 1);
  assert.equal(threads[0].channel, 'general');
});

test('does not merge equal generic messages from different contacts', () => {
  const base = { direction: 'inbound', text_body: 'Hola', occurred_at: '2026-09-03T10:24:00Z', classification_status: 'pending' };
  const threads = groupWhatsAppThreads([
    { ...base, event_id: 'one', channel: 'general', phone_number_id: 'browser-bridge:general', customer_wa_id: 'ana', customer_name: 'Ana' },
    { ...base, event_id: 'two', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', customer_wa_id: 'juan', customer_name: 'Juan' },
  ]);
  assert.equal(threads.length, 2);
});

test('merges legacy mirrored threads when latest content and time match', () => {
  const base = { direction: 'inbound', customer_wa_id: 'daniel alonso', customer_name: 'Daniel Alonso', classification_status: 'pending' };
  const threads = groupWhatsAppThreads([
    { ...base, event_id: 'general-a', channel: 'general', phone_number_id: 'browser-bridge:general', text_body: 'Necesito precio', occurred_at: '2026-09-03T10:15:01Z' },
    { ...base, event_id: 'general-b', channel: 'general', phone_number_id: 'browser-bridge:general', text_body: '[audio]', occurred_at: '2026-09-03T10:15:02Z' },
    { ...base, event_id: 'penosil-a', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', text_body: 'Otra consulta', occurred_at: '2026-09-03T10:15:50Z' },
    { ...base, event_id: 'penosil-b', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', text_body: '[audio · 0:13]', occurred_at: '2026-09-03T10:15:51Z' },
  ]);
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0].channels.sort(), ['general', 'penosil']);
});

test('does not group the same visible name across different channel accounts', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'general', channel: 'general', customer_wa_id: 'alias-general', customer_name: 'Daniel Alonso', text_body: 'Consulta técnica', occurred_at: '2026-09-03T09:00:00Z', classification_status: 'pending' },
    { event_id: 'penosil', channel: 'penosil', customer_wa_id: 'alias-penosil', customer_name: 'Daniel Alonso', text_body: '[audio]', occurred_at: '2026-09-03T10:00:00Z', classification_status: 'pending' },
  ]);
  assert.equal(threads.length, 2);
});

test('replaces unread preview with real messages after opening the chat', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'preview', channel: 'penosil', customer_wa_id: 'cliente', message_type: 'verified_unread_preview', text_body: '2 mensajes no leídos', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'real', channel: 'penosil', customer_wa_id: 'cliente', message_type: 'text', text_body: 'Quiero conocer el precio', occurred_at: '2026-09-01T10:01:00Z', classification_status: 'pending' },
  ]);
  assert.equal(threads[0].messageCount, 1);
  assert.equal(threads[0].text_body, 'Quiero conocer el precio');
});

test('replaces the unopened-chat text preview when the exact inbound message arrives', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'preview-text', channel: 'penosil', customer_wa_id: 'cliente', message_type: 'unread_chat_preview', text_body: 'Necesito precio', occurred_at: '2026-09-01T10:00:00Z', classification_status: 'pending' },
    { event_id: 'real-text', channel: 'penosil', customer_wa_id: 'cliente', message_type: 'text', text_body: 'Necesito precio', occurred_at: '2026-09-01T10:01:00Z', classification_status: 'pending' },
  ]);
  assert.equal(threads[0].messageCount, 1);
  assert.equal(threads[0].events[0].event_id, 'real-text');
});
