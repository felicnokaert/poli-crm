import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent } from '../src/assistant-answer.mjs';
import { asksApplicators } from '../src/assistant-rapyp.mjs';
import { asksClient } from '../src/assistant-client.mjs';

// Revisión del 23/10: preguntas típicas que el asistente entendía mal.
test('asistente: tema de preguntas típicas', () => {
  const cases = [
    ['cuanto rinde el easyspray', 'rendimiento'],
    ['cuantos kilos necesito para 20 m2', 'rendimiento'],
    ['sirve para tanques de agua potable?', 'alimentos'],
    ['cuanto tarda en llegar el envio a cordoba', 'envios'],
    ['con que pistola se aplica', 'aplicacion'],
    ['cuanto tarda en secar la poxiplast', 'tiempos'],
  ];
  for (const [query, key] of cases) assert.equal(detectIntent(query)?.key, key, query);
  assert.equal(detectIntent('cuanto sale la resina epoxi de 1 kg'), null);
});

test('asistente: aplicadores solo cuando se piden', () => {
  assert.ok(asksApplicators('que aplicadores me recomendas en cordoba'));
  assert.ok(asksApplicators('me recomendas un aplicador en rosario'));
  assert.ok(asksApplicators('quien lo aplica en mendoza'));
  assert.ok(!asksApplicators('con que pistola se aplica'));
  assert.ok(!asksApplicators('que me recomendas para el techo'));
});

test('asistente: pedidos de ficha de cliente', () => {
  assert.ok(asksClient('que sabes del cliente Pinturerias Rex'));
  assert.ok(asksClient('hablame de Lavopa'));
  assert.ok(asksClient('contame todo de Acme'));
});
