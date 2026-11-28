import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanParams, clientTypeFrom, compareWithList, computePrice, findClientByCuit, marginFor, mergeCosts, parseCostPaste, roundUp, tierFor } from '../src/pricing-engine.mjs';
import { pricingEngineAdmin, publicResult } from '../lib/pricing-engine.mjs';

const params = { defaultMargin: 50, margins: [{ match: 'resinplast', margin: 100 }], clientAdjust: { consumidor: 0, aplicador: -10, revendedor: -20, distribuidor: -30 }, tiers: [{ from: 1, percent: 0 }, { from: 10, percent: 5 }], rounding: 0, vat: 21 };

test('el orden de remarcación es costo → margen → tipo de cliente → cantidad → forma de pago', () => {
  const result = computePrice({ cost: 10, product: { family: 'Resinplast' }, clientType: 'aplicador', quantity: 10, payment: { name: 'Contado', discount_percent: 5 }, params });
  // 10 × 2 × 0,9 × 0,95 × 0,95 = 16,245 → 16,25 (sin redondeo: a centavos)
  assert.equal(result.net, 16.25);
  assert.equal(result.gross, Math.round(16.25 * 1.21 * 100) / 100);
  assert.equal(result.steps.length, 5);
  assert.equal(result.totalNet, 162.5);
});

test('recargo por forma de pago y redondeo hacia arriba', () => {
  const result = computePrice({ cost: 10, product: {}, quantity: 1, payment: { name: 'Tarjeta', surcharge_percent: 10 }, params: { ...params, rounding: 0.5 } });
  // 10 × 1,5 × 1,1 = 16,5 → queda 16,5
  assert.equal(result.net, 16.5);
  assert.equal(roundUp(16.01, 0.5), 16.5);
});

test('sin costo avisa en vez de inventar un precio', () => {
  assert.match(computePrice({ cost: null, params }).error, /costo/);
});

test('parámetros: valores de fábrica marcados como ejemplo y limpieza de rangos', () => {
  const clean = cleanParams({});
  assert.equal(clean.example, true);
  const odd = cleanParams({ defaultMargin: 9999, tiers: [{ from: 50, percent: 6 }, { from: 1, percent: 0 }, { from: 50, percent: 8 }] });
  assert.equal(odd.defaultMargin, 500);
  assert.deepEqual(odd.tiers.map((row) => row.from), [1, 50]);
  assert.equal(tierFor(odd, 60).from, 50);
  assert.equal(marginFor(cleanParams(params), { name: 'Resina RESINPLAST 1 kg' }).margin, 100);
});

test('tipo de cliente desde la ficha y búsqueda por CUIT', () => {
  assert.equal(clientTypeFrom({ tipoCliente: 'inyeccion' }), 'aplicador');
  assert.equal(clientTypeFrom({ rubro: 'Ferretería' }), 'revendedor');
  assert.equal(clientTypeFrom({ sourceType: 'Distribuidor zona sur' }), 'distribuidor');
  assert.equal(clientTypeFrom({ name: 'Juan' }), null);
  assert.equal(findClientByCuit([{ cuit: '30-71234567-8', name: 'X' }], '30712345678').name, 'X');
});

test('costos pegados desde una planilla', () => {
  const { rows, errors } = parseCostPaste('KT-618-20;180\nre-608-750\t9,40\nsin costo\n');
  assert.deepEqual(rows, [{ sku: 'KT-618-20', usd: 180 }, { sku: 'RE-608-750', usd: 9.4 }]);
  assert.equal(errors.length, 1);
  const merged = mergeCosts({ A: { usd: 1 } }, [...rows, { sku: 'A', remove: true }], { who: 'diego', at: 'hoy' });
  assert.deepEqual(Object.keys(merged), ['KT-618-20', 'RE-608-750']);
  assert.equal(merged['KT-618-20'].by, 'diego');
});

test('comparación con la lista minorista', () => {
  assert.deepEqual(compareWithList({ net: 11 }, { net: 10 }), { listNet: 10, diffPercent: 10 });
});

test('quien no maneja precios no ve el costo ni el margen', () => {
  const full = computePrice({ cost: 10, product: {}, params });
  const shown = publicResult(full);
  assert.equal(shown.steps.length, full.steps.length - 1);
  assert.ok(!('markupOverCost' in shown));
  assert.ok(!JSON.stringify(shown).includes('Costo'));
});

function fakeStore(initial) {
  let detail = initial;
  const http = async (url, init = {}) => {
    if (String(url).includes('crm_system_status') && (!init.method || init.method === 'GET')) return new Response(JSON.stringify(detail ? [{ detail }] : []), { status: 200 });
    if (init.method === 'POST') { detail = JSON.parse(init.body)[0].detail; return new Response('[]', { status: 201 }); }
    return new Response('[]', { status: 200 });
  };
  return { http, read: () => detail };
}
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };

test('servidor: un vendedor cotiza sin ver costos y no puede guardar', async () => {
  const store = fakeStore({ params: { ...params, example: false }, costs: { 'KT-1': { usd: 10 } } });
  const options = { authenticate: async () => ({ id: 'u', email: 'brenda@grupopoliplast.com.ar' }), isAdmin: () => false };
  const got = await pricingEngineAdmin({ body: { op: 'get' } }, env, store.http, options);
  assert.equal(got.body.editor, false);
  assert.equal(got.body.costs, undefined);
  assert.equal(got.body.costCount, 1);
  const quote = await pricingEngineAdmin({ body: { op: 'quote', sku: 'kt-1', quantity: 1 } }, env, store.http, options);
  assert.equal(quote.body.result.net, 15);
  assert.ok(!('markupOverCost' in quote.body.result));
  const save = await pricingEngineAdmin({ body: { op: 'save-costs', rows: [{ sku: 'KT-2', usd: 5 }] } }, env, store.http, options);
  assert.equal(save.status, 403);
});

test('servidor: Diego carga costos y parámetros', async () => {
  const store = fakeStore(null);
  const options = { authenticate: async () => ({ id: 'd', email: 'diegoraul@grupopoliplast.com.ar' }), isAdmin: () => false };
  const saved = await pricingEngineAdmin({ body: { op: 'save-costs', rows: [{ sku: 'kt-2', usd: 5 }] } }, env, store.http, options);
  assert.equal(saved.status, 200);
  assert.equal(store.read().costs['KT-2'].usd, 5);
  await pricingEngineAdmin({ body: { op: 'save-params', params: { defaultMargin: 40 } } }, env, store.http, options);
  assert.equal(store.read().params.defaultMargin, 40);
  assert.equal(store.read().params.example, false);
  assert.equal(store.read().costs['KT-2'].usd, 5);
});
