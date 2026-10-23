import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingOrders, recoverList, weeklyFunnel, weekStart, operationSummary } from '../src/shopify-operation.mjs';
import { issuesOf } from '../src/shopify-board.mjs';
import { weightGrams, orderRow, checkoutRow, variantRow } from '../lib/shopify.mjs';

const now = Date.parse('2026-10-24T15:00:00Z');
const ago = (hours) => new Date(now - hours * 3600000).toISOString();
const order = (over) => ({ id: 'o', name: '#1', created_at: ago(30), cancelled: false, test: false, financial_status: 'PAID', fulfillment_status: 'UNFULFILLED', delivery: 'SHIPPING', total: 100, ...over });

test('pedidos pagos sin entregar: envío a las 24 h, retiro a los 7 días', () => {
  const list = pendingOrders([
    order({ id: 'a' }), order({ id: 'b', created_at: ago(5) }), order({ id: 'c', delivery: 'PICK_UP', created_at: ago(24 * 10) }),
    order({ id: 'd', delivery: 'PICK_UP', created_at: ago(24 * 3) }), order({ id: 'e', fulfillment_status: 'FULFILLED' }),
    order({ id: 'f', financial_status: 'PENDING' }), order({ id: 'g', cancelled: true }), order({ id: 'h', test: true }),
  ], now);
  assert.deepEqual(list.map((item) => item.id), ['c', 'a']);
  assert.equal(list[0].kind, 'retiro');
  assert.equal(list[0].days, 10);
  assert.deepEqual(operationSummary([order({ id: 'a' })], [], now), { shipping: 1, pickups: 0, abandoned: 0 });
});

test('carritos para recuperar: sin completados, sin monto cero ni repetidos', () => {
  const base = { created_at: ago(2), completed: false, total: 500, items: [{ title: 'Resina', quantity: 2 }] };
  const list = recoverList([{ ...base, id: '1' }, { ...base, id: '2' }, { ...base, id: '3', completed: true }, { ...base, id: '4', total: 0 }, { ...base, id: '5', total: 900, created_at: ago(1) }]);
  assert.deepEqual(list.map((item) => item.id), ['5', '1']);
});

test('embudo semanal: abandonados contra pedidos pagos, la semana en curso marcada', () => {
  assert.equal(weekStart('2026-10-24T15:00:00Z'), '2026-10-19');
  const orders = [order({ id: 'a', created_at: '2026-10-21T15:00:00Z', total: 1000 }), order({ id: 'b', created_at: '2026-10-14T15:00:00Z', total: 500 })];
  const checkouts = [1, 2, 3].map((n) => ({ id: String(n), created_at: `2026-10-2${n}T10:00:00Z`, completed: false, total: 10, items: [{ title: `P${n}`, quantity: 1 }] }));
  const rows = weeklyFunnel(orders, checkouts, 5, now);
  assert.equal(rows[0].week, '2026-10-19');
  assert.equal(rows[0].orders, 1);
  assert.equal(rows[0].abandoned, 3);
  assert.equal(rows[0].rate, 0.25);
  assert.equal(rows[0].partial, true);
  assert.equal(rows[1].partial, false);
});

test('reglas nuevas: sin peso, seguir vendiendo sin stock y sin acusar antes de leer el peso', () => {
  const product = { status: 'ACTIVE', description_length: 100, seo_title: 'x', media_count: 1, total_inventory: 0 };
  assert.ok(issuesOf(product, [{ sku: 'A', price: 1, weight_grams: 0, inventory_policy: 'DENY' }]).includes('sin_peso'));
  assert.ok(!issuesOf(product, [{ sku: 'A', price: 1, weight_grams: null }]).includes('sin_peso'));
  assert.ok(issuesOf(product, [{ sku: 'A', price: 1, weight_grams: 500, inventory_policy: 'DENY' }]).includes('stock_cero'));
  assert.ok(!issuesOf(product, [{ sku: 'A', price: 1, weight_grams: 500, inventory_policy: 'CONTINUE' }]).includes('stock_cero'));
});

test('lectura de Shopify: peso en gramos, pedidos y carritos sin datos del comprador', () => {
  assert.equal(weightGrams({ value: 1.5, unit: 'KILOGRAMS' }), 1500);
  assert.equal(weightGrams({ value: 0, unit: 'KILOGRAMS' }), 0);
  assert.equal(weightGrams(null), null);
  assert.equal(variantRow({ id: 'v', sku: ' A ', inventoryPolicy: 'CONTINUE', inventoryItem: { measurement: { weight: { value: 250, unit: 'GRAMS' } } } }, 'p').weight_grams, 250);
  const row = orderRow({ id: 'o', name: '#9', createdAt: ago(1), displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', currentTotalPriceSet: { shopMoney: { amount: '10.5', currencyCode: 'ARS' } }, fulfillmentOrders: { nodes: [{ deliveryMethod: { methodType: 'PICK_UP' } }] } });
  assert.equal(row.delivery, 'PICK_UP');
  assert.equal(row.total, 10.5);
  assert.deepEqual(Object.keys(checkoutRow({ id: 'c', createdAt: ago(1), lineItems: { nodes: [{ title: 'X', quantity: 2 }] } })).includes('email'), false);
});
