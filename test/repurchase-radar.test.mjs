import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepurchaseRadar } from '../src/repurchase-radar.mjs';

test('flags a customer as due for reorder when overdue past their average interval', () => {
  const sales = [
    { customer: 'Cliente A', date: '2026-07-01', items: [{ description: 'Easy Spray' }] },
    { customer: 'Cliente A', date: '2026-08-01', items: [{ description: 'Easy Spray' }] },
  ];
  // Promedio de intervalo: 31 días. "Hoy" = 2026-09-15 => 45 días desde la
  // última compra, ya pasó el promedio.
  const result = buildRepurchaseRadar(sales, new Date('2026-09-15'));
  assert.equal(result.length, 1);
  assert.equal(result[0].customer, 'Cliente A');
  assert.equal(result[0].product, 'Easy Spray');
  assert.equal(result[0].avgIntervalDays, 31);
  assert.equal(result[0].purchaseCount, 2);
});

test('does not flag a customer who is still within their normal cycle', () => {
  const sales = [
    { customer: 'Cliente B', date: '2026-08-01', items: [{ description: 'Kit Poliuretano' }] },
    { customer: 'Cliente B', date: '2026-08-31', items: [{ description: 'Kit Poliuretano' }] },
  ];
  const result = buildRepurchaseRadar(sales, new Date('2026-09-05'));
  assert.equal(result.length, 0);
});

test('needs at least two purchases of the same product to estimate a cycle', () => {
  const sales = [
    { customer: 'Cliente C', date: '2026-01-01', items: [{ description: 'Solo una vez' }] },
  ];
  const result = buildRepurchaseRadar(sales, new Date('2026-09-15'));
  assert.equal(result.length, 0);
});

test('tracks products separately per customer', () => {
  const sales = [
    { customer: 'Cliente D', date: '2026-07-01', items: [{ description: 'Producto X' }] },
    { customer: 'Cliente D', date: '2026-07-11', items: [{ description: 'Producto X' }] },
    { customer: 'Cliente D', date: '2026-08-01', items: [{ description: 'Producto Y' }] },
    { customer: 'Cliente D', date: '2026-08-11', items: [{ description: 'Producto Y' }] },
  ];
  const result = buildRepurchaseRadar(sales, new Date('2026-09-15'));
  const products = result.map((item) => item.product).sort();
  assert.deepEqual(products, ['Producto X', 'Producto Y']);
});
