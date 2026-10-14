import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConversation } from '../src/conversation-insights.mjs';

const ev = (direction, text, at) => ({ direction, text_body: text, occurred_at: at });
const NOW = new Date('2026-10-15T12:00:00Z');

test('sin mensajes de texto devuelve vacío', () => {
  assert.equal(analyzeConversation([], { now: NOW }).empty, true);
  assert.equal(analyzeConversation([{ direction: 'status', occurred_at: '2026-10-15T10:00:00Z' }], { now: NOW }).empty, true);
});

test('cliente que pide precio y quiere comprar con apuro puntúa alto y sugiere confirmar', () => {
  const r = analyzeConversation([
    ev('inbound', 'Hola, necesito precio del Penosil para hoy', '2026-10-15T09:00:00Z'),
    ev('outbound', 'Te paso la lista', '2026-10-15T09:10:00Z'),
    ev('inbound', 'Perfecto, quiero comprar 20 unidades, confirmo', '2026-10-15T10:00:00Z'),
  ], { now: NOW });
  assert.ok(r.readiness >= 8, `readiness ${r.readiness}`);
  assert.equal(r.sentiment, 'Positivo');
  assert.equal(r.awaitingReply, true);
  assert.match(r.nextStep, /confirmar pedido/);
});

test('un reclamo es negativo y pide respuesta hoy', () => {
  const r = analyzeConversation([ev('inbound', 'Tengo un reclamo, el pedido llegó roto', '2026-10-15T09:00:00Z')], { now: NOW });
  assert.equal(r.sentiment, 'Negativo');
  assert.match(r.nextStep, /reclamo/);
});

test('detecta competidores mencionados y objeción de precio', () => {
  const r = analyzeConversation([ev('inbound', 'Argenpur me lo da más barato, lo voy a pensar', '2026-10-14T09:00:00Z')], { now: NOW });
  assert.deepEqual(r.competitors, ['Argenpur']);
  assert.ok(r.signals.some((s) => /Objeción/.test(s)));
});

test('si el último mensaje es nuestro y pasaron más de 3 días sugiere seguimiento', () => {
  const r = analyzeConversation([
    ev('inbound', 'Necesito precio y ficha técnica', '2026-10-05T09:00:00Z'),
    ev('outbound', 'Te los mando', '2026-10-05T10:00:00Z'),
  ], { now: NOW });
  assert.equal(r.awaitingReply, false);
  assert.match(r.nextStep, /seguimiento/);
});
