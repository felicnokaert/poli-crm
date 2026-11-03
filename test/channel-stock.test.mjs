import test from 'node:test';
import assert from 'node:assert/strict';
import { channelStock, channelStockAlerts } from '../src/channel-stock.mjs';

const products = [
  { id: 1, title: 'Balde Poliplus 740', status: 'active' },
  { id: 2, title: 'Resina', status: 'active' },
  { id: 3, title: 'Borrador', status: 'draft' },
  { id: 4, title: 'Sin cruce', status: 'active' },
];
const variants = [
  { product_id: 1, sku: 'kt-740-450', inventory_quantity: 0, inventory_policy: 'CONTINUE' },
  { product_id: 2, sku: 'RE-1', inventory_quantity: 0, inventory_policy: 'DENY' },
  { product_id: 3, sku: 'BO-1', inventory_quantity: 5, inventory_policy: 'DENY' },
  { product_id: 4, sku: 'NADA', inventory_quantity: 5, inventory_policy: 'DENY' },
];
const mlItems = [
  { sku: 'KT-740-450', status: 'paused', available_quantity: 0, sold_quantity: 40 },
  { sku: 'RE-1', status: 'active', available_quantity: 12, sold_quantity: 9 },
  { sku: 'BO-1', status: 'paused', available_quantity: 0, sold_quantity: 1 },
];

test('sobreventa: se vende en Shopify pero ML está pausado', () => {
  const { oversell, restock } = channelStock({ products, variants, mlItems });
  assert.deepEqual(oversell.map((item) => item.id), [1]);
  assert.equal(oversell[0].variants[0].sku, 'KT-740-450');
  assert.deepEqual(restock.map((item) => item.id), [2]);
});

test('no cuenta borradores ni productos sin publicación en ML', () => {
  const { oversell, restock } = channelStock({ products, variants, mlItems });
  assert.ok(![...oversell, ...restock].some((item) => item.id === 3 || item.id === 4));
});

test('alertas: una por tipo con ejemplos', () => {
  const alerts = channelStockAlerts({ products, variants, mlItems });
  assert.deepEqual(alerts.map((alert) => alert.type), ['sobreventa-shopify', 'reposicion-shopify']);
  assert.match(alerts[0].detail, /Balde Poliplus 740/);
});
