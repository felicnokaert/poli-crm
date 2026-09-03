import test from 'node:test';
import assert from 'node:assert/strict';
import { groupWhatsAppThreads, isIgnoredWhatsAppContact, whatsappContactKey } from '../src/whatsapp-threads.mjs';

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

test('reconciles a delayed legacy mirror only when its content also matches', () => {
  const base = { customer_wa_id: 'polymach', customer_name: 'polymach', classification_status: 'pending', text_body: '[audio]' };
  const threads = groupWhatsAppThreads([
    { ...base, event_id: 'general', channel: 'general', phone_number_id: 'browser-bridge:general', occurred_at: '2026-09-03T09:00:00Z' },
    { ...base, event_id: 'penosil', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', text_body: '[audio · 0:08]', occurred_at: '2026-09-03T10:24:00Z' },
  ]);
  assert.equal(threads.length, 1);
});

test('quarantines simultaneous cross-channel mirrors even when browser aliases differ', () => {
  const grouped = groupWhatsAppThreads([
    { event_id: 'bridge.open.general-a', channel: 'general', direction: 'inbound', customer_name: 'Marcelo Ceratto', text_body: 'Hola dame un poco de tiempo, me interesa', occurred_at: '2026-09-03T12:19:00Z', phone_number_id: 'browser-bridge:general', classification_status: 'pending' },
    { event_id: 'bridge.open.penosil-a', channel: 'penosil', direction: 'inbound', customer_name: '+54 9 2302 48-4069', text_body: 'Hola dame un poco de tiempo, me interesa', occurred_at: '2026-09-03T12:19:01Z', phone_number_id: 'browser-bridge:penosil', classification_status: 'pending' },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].channelConflict, true);
});

test('reconciles a mirrored contact when aliases match but latest messages differ', () => {
  const base = { direction: 'inbound', classification_status: 'pending' };
  const threads = groupWhatsAppThreads([
    { ...base, event_id: 'g1', channel: 'general', phone_number_id: 'browser-bridge:general', customer_name: 'Ariana', text_body: '[audio]', occurred_at: '2026-09-03T13:06:00Z' },
    { ...base, event_id: 'g2', channel: 'general', phone_number_id: 'browser-bridge:general', customer_name: 'Ariana', text_body: 'Mensaje posterior', occurred_at: '2026-09-03T13:12:00Z' },
    { ...base, event_id: 'p1', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', customer_name: 'Ariana Diecinueve Cuarenta Y Ocho', text_body: '[audio · 0:04]', occurred_at: '2026-09-03T13:06:30Z' },
    { ...base, event_id: 'p2', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', customer_name: 'Ariana Diecinueve Cuarenta Y Ocho', text_body: 'Dale', occurred_at: '2026-09-03T13:08:00Z' },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].channelConflict, true);
});

test('reconciles the real production case: official Meta webhook on General vs scraped preview on Penosil', () => {
  // General llega por webhook oficial de Meta (phone_number_id real, nunca
  // browser-bridge). Penosil scrapea la misma conversación como preview.
  // Antes de esta corrección el guard exigía browser-bridge en ambos lados
  // y este caso -el que reportó Felipe con Ariana y Emanuel- nunca se unía.
  const threads = groupWhatsAppThreads([
    { event_id: 'wamid.real-1', channel: 'general', phone_number_id: '1168807706304960', customer_wa_id: '5491152294957', customer_name: 'Ariana', direction: 'inbound', message_type: 'text', text_body: 'Dale', occurred_at: '2026-09-03T16:08:14Z', classification_status: 'pending' },
    { event_id: 'bridge.open.preview-1', channel: 'penosil', phone_number_id: 'browser-bridge:penosil', customer_wa_id: 'ariana diecinueve cuarenta y ocho', customer_name: 'Ariana Diecinueve Cuarenta Y Ocho', direction: 'inbound', message_type: 'unread_chat_preview', text_body: 'Dale', occurred_at: '2026-09-03T16:08:16.815Z', classification_status: 'pending' },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].channelConflict, true);
  assert.equal(threads[0].channel, 'general');
});

test('does not merge two genuinely distinct official Meta conversations even with matching text', () => {
  const threads = groupWhatsAppThreads([
    { event_id: 'wamid.real-a', channel: 'general', phone_number_id: '1168807706304960', customer_wa_id: '5491100000001', customer_name: 'Cliente A', direction: 'inbound', text_body: 'Necesito precio de la lona', occurred_at: '2026-09-03T10:00:00Z', classification_status: 'pending' },
    { event_id: 'wamid.real-b', channel: 'penosil', phone_number_id: '9998887706304960', customer_wa_id: '5493500000002', customer_name: 'Cliente B', direction: 'inbound', text_body: 'Necesito precio de la lona', occurred_at: '2026-09-03T10:00:02Z', classification_status: 'pending' },
  ]);
  assert.equal(threads.length, 2);
});

test('a non-commercial rule created from the General identity (real phone) also excludes the same contact scraped from Penosil (name-only wa_id)', () => {
  const rules = [{ contactIdentity: '5491152294957', customerWaId: '5491152294957', customerName: 'Ariana', category: 'Particular' }];
  const penosilEvent = { channel: 'penosil', customer_wa_id: 'ariana diecinueve cuarenta y ocho', customer_name: 'Ariana Diecinueve Cuarenta Y Ocho' };
  assert.equal(isIgnoredWhatsAppContact(rules, penosilEvent), true);
});

test('does not exclude an unrelated contact with a short, unrelated name', () => {
  const rules = [{ contactIdentity: 'juan', customerWaId: '', customerName: 'Juan' }];
  assert.equal(isIgnoredWhatsAppContact(rules, { customer_name: 'María López' }), false);
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
