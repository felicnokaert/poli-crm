import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mlEntries, percentClean, shopifyEntries, snapshotRows, trendOf, workList } from '../src/improvement-center.mjs';

const items = [
  { id: 'A', status: 'active', clips_count: 0, pictures_count: 5, description_length: 200, health: 0.9, available_quantity: 5, sold_quantity: 3, visits_30d: 10 },
  { id: 'B', status: 'active', clips_count: 1, pictures_count: 2, description_length: 0, health: 0.5, available_quantity: 0, sold_quantity: 0, visits_30d: 300 },
  { id: 'C', status: 'active', clips_count: 1, pictures_count: 6, description_length: 300, health: 0.95, available_quantity: 9, sold_quantity: 9, visits_30d: 50 },
  { id: 'D', status: 'paused', clips_count: 0, pictures_count: 0, description_length: 0, available_quantity: 0, sold_quantity: 0 },
];
const health = [{ id: 'A', quality_level: 'Profesional', px_color: 'green' }, { id: 'C', quality_level: 'Básica', px_color: 'orange' }];

test('Mercado Libre: cuenta solo las activas y suma calidad y experiencia de las revisadas', () => {
  const ml = mlEntries(items, health);
  const by = Object.fromEntries(ml.entries.map((entry) => [entry.key, entry.count]));
  assert.equal(ml.total, 3);
  assert.equal(by['sin-clip'], 1);
  assert.equal(by['pocas-fotos'], 1);
  assert.equal(by['sin-descripcion'], 1);
  assert.equal(by['sin-stock'], 1);
  assert.equal(by['calidad-ml'], 1);
  assert.equal(by['experiencia-compra'], 1);
  assert.equal(ml.entries.find((entry) => entry.key === 'calidad-ml').partial, true);
  // Limpias: ninguna (A sin clip, B con varios problemas, C calidad y experiencia).
  assert.equal(ml.clean, 0);
  assert.equal(percentClean(ml), 0);
});

test('Shopify: no cuenta los archivados y el puntaje sale de lo accionable', () => {
  const products = [
    { id: 'p1', status: 'ACTIVE', title: 'x', description_length: 100, seo_title: 'a', seo_description: 'b', media_count: 1, total_inventory: 5 },
    { id: 'p2', status: 'ACTIVE', title: 'y', description_length: 0, seo_title: '', seo_description: '', media_count: 1, total_inventory: 5 },
    { id: 'p3', status: 'ARCHIVED', title: 'z', description_length: 0, seo_title: '', seo_description: '', media_count: 0, total_inventory: 0 },
  ];
  const variants = [{ id: 'v1', product_id: 'p1', sku: 'A', price: 10, inventory_quantity: 5 }, { id: 'v2', product_id: 'p2', sku: 'B', price: 10, inventory_quantity: 5 }];
  const shop = shopifyEntries(products, variants);
  assert.equal(shop.total, 2);
  assert.equal(shop.clean, 1);
  assert.equal(shop.entries.find((entry) => entry.key === 'sin_descripcion').count, 1);
  assert.equal(percentClean(shop), 50);
});

test('foto diaria y avance: baja contra hace 7 días', () => {
  const rows = snapshotRows('2026-10-24', { entries: [{ key: 'sin-clip', count: 4, total: 10 }], total: 10, clean: 6 }, null);
  assert.deepEqual(rows.map((row) => [row.channel, row.issue, row.count]), [['ml', 'sin-clip', 4], ['ml', '_limpio', 6]]);
  const history = [
    { day: '2026-10-10', channel: 'ml', issue: 'sin-clip', count: 9, total: 10 },
    { day: '2026-10-16', channel: 'ml', issue: 'sin-clip', count: 7, total: 10 },
    { day: '2026-10-22', channel: 'ml', issue: 'sin-clip', count: 5, total: 10 },
  ];
  const trend = trendOf(history, 'ml', 'sin-clip', '2026-10-24', 4);
  assert.equal(trend.delta, -3); // contra el 16/10 (7 días o más)
  assert.deepEqual(trend.series, [9, 7, 5, 4]);
  assert.equal(trendOf([], 'ml', 'x', '2026-10-24', 3).delta, null);
});

test('lista de trabajo: accionables primero, mayor proporción arriba y sin ceros', () => {
  const list = workList([
    { key: 'a', count: 0, total: 10, clean: true }, { key: 'info', count: 9, total: 10, clean: false },
    { key: 'b', count: 2, total: 10, clean: true }, { key: 'c', count: 8, total: 10, clean: true },
  ]);
  assert.deepEqual(list.map((entry) => entry.key), ['c', 'b', 'info']);
});
