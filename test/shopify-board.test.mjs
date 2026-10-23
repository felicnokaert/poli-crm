import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, filterRows, periodTotals, summarize } from '../src/shopify-board.mjs';

const products = [
  { id: 'p1', title: 'Balde plástico 20 L', status: 'ACTIVE', vendor: 'Grupo Poliplast', product_type: 'Baldes', tags: '', description_length: 0, seo_title: '', seo_description: '', media_count: 2, total_inventory: 5994, shopify_updated_at: '2026-10-20' },
  { id: 'p2', title: 'Resina epoxi 1 kg', status: 'ACTIVE', vendor: 'Resinplast', product_type: 'Resinas', tags: '', description_length: 200, seo_title: 'T', seo_description: 'D', media_count: 3, total_inventory: 0, shopify_updated_at: '2026-10-22' },
  { id: 'p3', title: 'Viejo', status: 'ARCHIVED', vendor: '', product_type: '', tags: '', description_length: 0, seo_title: '', seo_description: '', media_count: 0, total_inventory: 0 },
];
const variants = [
  { id: 'v1', product_id: 'p1', sku: 'BA-20', price: 10000, inventory_quantity: 999, options: [] },
  { id: 'v2', product_id: 'p1', sku: 'BA-20', price: 12000, inventory_quantity: 999, options: [] },
  { id: 'v3', product_id: 'p2', sku: '', price: 0, inventory_quantity: 0, options: [] },
];

test('detecta lo que le falta a cada producto', () => {
  const rows = boardRows(products, variants);
  const issues = Object.fromEntries(rows.map((row) => [row.product.id, row.issues]));
  assert.deepEqual(issues.p1, ['sin_descripcion', 'sin_seo', 'stock_relleno', 'sku_repetido']);
  assert.deepEqual(issues.p2, ['stock_cero', 'sin_sku', 'precio_cero']);
  const stats = summarize(rows);
  assert.equal(stats.active, 2);
  assert.equal(stats.variants, 3);
  assert.equal(stats.withIssues, 2); // el archivado no cuenta
  assert.equal(stats.issueCounts.sin_descripcion, 1);
});

test('filtra por estado, problema y búsqueda (también por SKU) y ordena', () => {
  const rows = boardRows(products, variants);
  assert.deepEqual(filterRows(rows, { status: 'ACTIVE', issue: 'stock_cero' }).map((row) => row.product.id), ['p2']);
  assert.deepEqual(filterRows(rows, { query: 'ba-20' }).map((row) => row.product.id), ['p1']);
  assert.deepEqual(filterRows(rows, { query: 'resina' }).map((row) => row.product.id), ['p2']);
  assert.deepEqual(filterRows(rows, { sort: 'recientes' }).map((row) => row.product.id)[0], 'p2');
  assert.equal(rows[0].minPrice, 10000);
  assert.equal(rows[0].maxPrice, 12000);
});

test('pedidos de 7 días contra los 7 anteriores', () => {
  const days = [
    { day: '2026-10-22', orders: 4, amount: '400' }, { day: '2026-10-20', orders: 2, amount: '200' },
    { day: '2026-10-12', orders: 3, amount: '300' },
  ];
  const result = periodTotals(days, 7, '2026-10-23');
  assert.equal(result.current.orders, 6);
  assert.equal(result.previous.orders, 3);
  assert.equal(result.ordersChange, 1);
});
