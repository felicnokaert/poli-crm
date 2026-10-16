import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, conversationKey, groupConversations, loadByMember, suggestOwner, suggestedReply, waitingLabel } from '../src/team-inbox.mjs';

const members = [{ id: 'm1', name: 'Juan', active: true }, { id: 'm2', name: 'Ezequiel', active: true }, { id: 'm3', name: 'David', active: false }];
const rules = [{ id: 'r1', kind: 'canal', value: 'juan', member_id: 'm1' }, { id: 'r2', kind: 'palabra', value: 'náutica', member_id: 'm2' }, { id: 'r3', kind: 'palabra', value: 'fibra', member_id: 'm3' }];
const events = [
  { channel: 'general', direction: 'inbound', customer_wa_id: '549111', customer_name: 'Marta Pérez', text_body: 'Hola, precio de la resina?', occurred_at: '2026-10-16T10:00:00Z' },
  { channel: 'general', direction: 'inbound', customer_wa_id: '549111', customer_name: 'Marta Pérez', text_body: 'Para un barco, es náutica', occurred_at: '2026-10-16T10:05:00Z' },
  { channel: 'juan', direction: 'inbound', customer_wa_id: '549222', customer_name: '', text_body: 'Buenas', occurred_at: '2026-10-16T09:00:00Z' },
  { channel: 'general', direction: 'inbound', customer_wa_id: '549333', customer_name: 'Luis', text_body: 'Necesito fibra', occurred_at: '2026-10-15T09:00:00Z' },
];
const statusEvents = [{ channel: 'general', customer_wa_id: '549333', occurred_at: '2026-10-15T09:30:00Z' }];

test('agrupa por conversación, cuenta mensajes y detecta lo ya contestado desde el teléfono', () => {
  const convs = groupConversations(events, statusEvents);
  assert.equal(convs.length, 3);
  const marta = convs.find((item) => item.customerWaId === '549111');
  assert.equal(marta.messages, 2);
  assert.equal(marta.lastText, 'Para un barco, es náutica');
  assert.equal(convs.find((item) => item.customerWaId === '549333').answeredOutside, true);
  assert.equal(marta.answeredOutside, false);
  assert.equal(convs[0].key, conversationKey('general', '549111'), 'la más reciente primero');
});

test('las reglas sugieren dueño: palabra antes que canal, y no a quien se fue', () => {
  const convs = groupConversations(events, statusEvents);
  assert.equal(suggestOwner(convs.find((item) => item.customerWaId === '549111'), rules, members), 'm2');
  assert.equal(suggestOwner(convs.find((item) => item.customerWaId === '549222'), rules, members), 'm1');
  assert.equal(suggestOwner(convs.find((item) => item.customerWaId === '549333'), rules, members), null, 'David está inactivo');
});

test('el tablero respeta lo asignado y cuenta pendientes por persona', () => {
  const convs = groupConversations(events, statusEvents);
  const assignments = [{ conversation_key: conversationKey('general', '549111'), member_id: 'm1', status: 'derivada', note: 'pasa a Juan' }];
  const board = buildBoard(convs, assignments, rules, members);
  const marta = board.find((item) => item.customerWaId === '549111');
  assert.equal(marta.memberId, 'm1');
  assert.equal(marta.suggestedId, null);
  assert.equal(marta.status, 'derivada');
  const { counts, unassigned } = loadByMember(board, members);
  assert.equal(counts.get('m1'), 1);
  assert.equal(unassigned, 1, 'solo la de 549222 queda abierta y sin dueño (549333 ya se contestó)');
});

test('la respuesta sugerida usa Academia, completa el nombre y marca qué validar', () => {
  const reply = suggestedReply({ customerName: 'Marta Pérez', lastText: 'Hola, ¿cuánto sale la resina?' }, 'Brenda');
  assert.equal(reply.title, 'Preparar cotización');
  assert.match(reply.text, /Marta/);
  assert.match(reply.text, /Brenda, Grupo Poliplast/);
  assert.ok(reply.validate.includes('precio'));
  assert.doesNotMatch(reply.text, /\$|USD/);
  assert.match(suggestedReply({ customerName: '+54 9 11', lastText: 'hola' }).text, /\[nombre\]/);
});

test('tiempo de espera legible', () => {
  const now = new Date('2026-10-16T12:00:00Z').getTime();
  assert.equal(waitingLabel('2026-10-16T11:30:00Z', now), '30 min');
  assert.equal(waitingLabel('2026-10-16T08:00:00Z', now), '4 h');
  assert.equal(waitingLabel('2026-10-12T12:00:00Z', now), '4 días');
});
