import { test } from 'node:test';
import assert from 'node:assert/strict';
import { economicsRows, itemEconomics, sampleShipping, senderCost } from '../lib/ml-economics.mjs';
import { asksMlEconomics, economicsContext, economicsView, retailPrice } from '../src/ml-economics-view.mjs';

const NOW = Date.parse('2026-10-23T12:00:00Z');

test('ganancia: unidades, facturado y comisión real por publicación (30 días)', () => {
  const orders = [
    { status: 'paid', date_created: '2026-10-20T10:00:00Z', shipping: { id: 111 }, order_items: [{ item: { id: 'MLA1' }, quantity: 2, unit_price: 10000, sale_fee: 1300 }] },
    { status: 'paid', date_created: '2026-10-10T10:00:00Z', shipping: { id: 222 }, order_items: [{ item: { id: 'MLA1' }, quantity: 1, unit_price: 10000, sale_fee: 1300 }, { item: { id: 'MLA2' }, quantity: 1, unit_price: 5000, sale_fee: 650 }] },
    { status: 'cancelled', date_created: '2026-10-20T10:00:00Z', order_items: [{ item: { id: 'MLA1' }, quantity: 5, unit_price: 1, sale_fee: 1 }] },
    { status: 'paid', date_created: '2026-08-01T10:00:00Z', order_items: [{ item: { id: 'MLA1' }, quantity: 9, unit_price: 1, sale_fee: 1 }] },
  ];
  const byItem = itemEconomics(orders, { now: NOW });
  assert.deepEqual(byItem.MLA1, { units: 3, revenue: 30000, fees: 3900, lastShipment: { id: '111', units: 2 } });
  assert.equal(byItem.MLA2.lastShipment, null);
  const rows = economicsRows(byItem, 9);
  assert.equal(rows.find((row) => row.id === 'MLA1').fees_30d, 3900);
  assert.equal(senderCost({ senders: [{ user_id: 9, cost: 4200 }, { user_id: 1, cost: 10 }] }, 9), 4200);
  assert.equal(senderCost({}, 9), null);
});

test('ganancia: envío de muestra repartido por unidad', async () => {
  const saved = [];
  const store = { upsert: async (table, rows) => saved.push(...rows) };
  const rows = [{ id: 'MLA1', seller_id: '9', units_30d: 3, last_shipment_id: '111', last_shipment_units: 2 }, { id: 'MLA2', seller_id: '9', units_30d: 1, last_shipment_id: '' }];
  const result = await sampleShipping({ seller_id: 9 }, rows, { get: async () => ({ senders: [{ user_id: 9, cost: 4000 }] }), token: 't', store, pause: 0 });
  assert.equal(result.sampled, 1);
  assert.equal(saved[0].shipping_per_unit, 2000);
});

test('stock y ganancia: reposición, lo que queda y contra la lista', () => {
  const items = [
    { id: 'MLA1', seller_id: '9', title: 'Espuma 750', status: 'active', price: 10000, available_quantity: 10 },
    { id: 'MLA2', seller_id: '9', title: 'Resina', status: 'active', price: 5000, available_quantity: 0 },
    { id: 'MLA3', seller_id: '9', title: 'Sin ventas', status: 'active', price: 1, available_quantity: 5 },
  ];
  const economics = [
    { id: 'MLA1', units_30d: 30, revenue_30d: 300000, fees_30d: 39000, shipping_per_unit: 2000, unit_cost: 4000 },
    { id: 'MLA2', units_30d: 3, revenue_30d: 15000, fees_30d: 1950 },
  ];
  const entry = { variant: { sku: 'PE750' }, rows: [{ wholesale: true, from: 1, gross: 7000 }, { wholesale: false, from: 1, gross: 9000 }] };
  assert.equal(retailPrice(entry).gross, 9000);
  const view = economicsView({ items, economics, skus: { MLA1: 'PE750' }, listPrices: { PE750: retailPrice(entry) } });
  const espuma = view.rows.find((row) => row.item.id === 'MLA1');
  assert.equal(espuma.perDay, 1);
  assert.equal(espuma.daysLeft, 10);
  assert.equal(espuma.restock, '10 días');
  assert.equal(espuma.feePerUnit, 1300);
  assert.equal(espuma.feePct, 13);
  assert.equal(espuma.net, 6700);
  assert.equal(espuma.vsList, -25.6);
  assert.equal(espuma.margin, Math.round((6700 / 1.21 - 4000) * 100) / 100);
  assert.deepEqual(view.restock.map((row) => row.item.id), ['MLA2', 'MLA1']);
  assert.equal(view.restock[0].restock, 'sin stock');
  assert.equal(view.selling.length, 2);
  assert.equal(view.belowList[0].item.id, 'MLA1');
  const text = economicsContext(view, { 9: 'POLIPLAST' });
  assert.match(text, /STOCK Y GANANCIA/);
  assert.match(text, /Resina \(POLIPLAST\): SIN STOCK/);
  assert.match(text, /queda \$ 6\.700 por unidad/);
  assert.ok(asksMlEconomics('qué publicaciones tengo que reponer?'));
  assert.ok(asksMlEconomics('cuánto nos queda de ganancia en mercado libre'));
  assert.ok(!asksMlEconomics('cuanto rinde el easyspray'));
});
