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

// Revisión del 24/10: preguntas nuevas de Mercado Libre, Shopify y alertas.
import { asksMlEconomics } from '../src/ml-economics-view.mjs';
import { asksMlCompetition } from '../src/ml-competition-view.mjs';
import { asksMlImprove } from '../src/ml-improve.mjs';
import { asksPrice } from '../src/assistant-prices.mjs';
import { asksRivals } from '../src/assistant-extra.mjs';
import { asksOps, asksTacos, opsContext } from '../src/assistant-ops.mjs';

test('asistente: ganancia, catálogo y clips se entienden sin nombrar el tema exacto', () => {
  assert.ok(asksMlEconomics('cuanto gano por el balde de 20 litros en mercado libre'));
  assert.equal(detectIntent('cuanto gano por el balde de 20 litros en mercado libre'), null); // no es rendimiento
  assert.ok(asksMlCompetition('quien me gana en el catalogo'));
  assert.ok(asksMlImprove('que publicaciones no tienen clip'));
  assert.ok(!asksMlCompetition('quien es la competencia en espuma de poliuretano')); // esa es la de Academia
  assert.ok(asksRivals('quien es la competencia en espuma de poliuretano'));
  assert.ok(!asksClient('quien es la competencia en espuma de poliuretano'));
});

test('asistente: "cuantas cotizaciones se cierran" no busca precios de lista', () => {
  assert.ok(!asksPrice('cuantas cotizaciones se cierran'));
  assert.ok(asksPrice('cotizame 3 kilos de resina'));
  assert.ok(asksPrice('cuanto sale la resina epoxi de 1 kg'));
});

test('asistente: alertas, Shopify y TACoS salen de las alertas del CRM', () => {
  for (const query of ['que hay que atender hoy', 'tenemos pedidos sin despachar en shopify', 'cuantos carritos abandonados hay', 'cual es mi tacos', 'cuanto gaste en publicidad este mes']) assert.ok(asksOps(query), query);
  assert.ok(asksTacos('cual es mi tacos'));
  assert.ok(!asksOps('cuanto rinde el balde de poxiplast'));
  const now = Date.parse('2026-10-24T15:00:00Z');
  const text = opsContext([{ type: 'a', entity_id: '', severity: 'alta', title: 'Pedido #1174: retiro sin retirar hace 10 días', detail: 'Pagado.', first_seen: '2026-10-21T15:00:00Z' }], { tacos: true, now });
  assert.match(text, /Urgente: Pedido #1174/);
  assert.match(text, /hace 3 días/);
  assert.match(text, /NO está conectada/);
  assert.match(opsContext([], { now }), /No hay alertas guardadas/);
});

test('número de comprobante escrito en la pregunta (26/10)', async () => {
  const { invoiceNumbersOf, invoiceLine } = await import('../src/assistant-extra.mjs');
  assert.deepEqual(invoiceNumbersOf('YO TENGO 13/10/2026 FCA 0006-00011425').filter((n) => n === '0006-00011425'), ['0006-00011425']);
  assert.deepEqual(invoiceNumbersOf('la FCA 6-11425'), ['0006-00011425']);
  assert.deepEqual(invoiceNumbersOf('cuándo compró Thorne'), []);
  assert.match(invoiceLine({ fecha: '2026-10-13', tipo: 'FCA', numero: '0006-00011425', company: 'POLIPLAST', cliente: 'THORNE SRL', total: 114671.7 }), /13\/10\/2026 · FCA 0006-00011425 · POLIPLAST · THORNE SRL/);
});
