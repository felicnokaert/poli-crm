import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientCards, clientContext, clientWords } from '../src/assistant-client.mjs';
import { actionsFrom } from '../lib/assistant-ai.mjs';

const clients = [
  { id: 'c1', company: 'ROLANDO MAXIMILIANO LAVOPA', city: 'Rincón de Milberg', province: 'Buenos Aires', phone: '54 9 11 6832-5335', cuit: '20-22575469-2', stage: 'Nuevo', mainProduct: 'ISO PM TAMBOR', lastPurchase: '08/09/2025' },
  { id: 'c2', company: 'Aislaciones Sur' },
];

test('"contame todo de lavopa" arma la ficha del cliente', () => {
  assert.deepEqual(clientWords('contame todo de lavopa'), ['lavopa']);
  const [card] = clientCards(clients, 'contame todo de lavopa');
  assert.equal(card.name, 'ROLANDO MAXIMILIANO LAVOPA');
  assert.match(card.lines.join(' '), /Tel: 54 9 11 6832-5335.*CUIT: 20-22575469-2.*Producto principal: ISO PM TAMBOR/);
  assert.match(clientContext([card]), /Ficha del cliente ROLANDO MAXIMILIANO LAVOPA/);
  assert.equal(clientCards(clients, 'lavopa').length, 1);
  assert.deepEqual(clientCards(clients, 'contame todo de fulano'), []);
});

test('actionsFrom: solo las acciones conocidas y completas', () => {
  const actions = actionsFrom([
    { type: 'text', text: 'Te propongo:' },
    { type: 'tool_use', id: 't1', name: 'crear_tarea', input: { titulo: 'Llamar a Lavopa', fecha: '2026-10-23' } },
    { type: 'tool_use', id: 't2', name: 'enviar_whatsapp', input: { texto: 'hola' } },
    { type: 'tool_use', id: 't3', name: 'anotar_en_cliente', input: { empresa: 'Lavopa' } },
    { type: 'tool_use', id: 't4', name: 'redactar_mensaje', input: { texto: 'Hola, ¿cómo va?' } },
  ]);
  assert.deepEqual(actions.map((action) => action.kind), ['crear_tarea', 'redactar_mensaje']);
});

test('guardar_respuesta: la IA propone guardar lo acordado (con pregunta y respuesta)', async () => {
  const { actionsFrom: fromContent } = await import('../lib/assistant-ai.mjs');
  const actions = fromContent([
    { type: 'tool_use', id: 't1', name: 'guardar_respuesta', input: { pregunta: '¿Cuánto rinde el Easyspray en otro espesor?', producto: 'Easy Spray', respuesta: 'Regla de 3 inversa: m² = 2 × 20 / espesor (mm).' } },
    { type: 'tool_use', id: 't2', name: 'guardar_respuesta', input: { pregunta: 'sin respuesta' } },
  ]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, 'guardar_respuesta');
});
