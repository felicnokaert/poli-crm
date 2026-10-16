import test from 'node:test';
import assert from 'node:assert/strict';
import { availableYears, bucketsFor, salesSeries, seriesSummary } from '../src/sales-history.mjs';

const sales = [
  { id: '1', date: '2026-01-10', unit: 'Resinplast', netAmount: 1000, currency: 'ARS' },
  { id: '2', date: '2026-02-05', unit: 'Resinplast', netAmount: 500, currency: 'ARS' },
  { id: '3', date: '2026-05-20', unit: 'Imperpur', netAmount: 200, currency: 'USD', exchangeRate: 1000 },
  { id: '4', date: '2025-12-31', unit: 'Resinplast', netAmount: 999, currency: 'ARS' },
];
const goals = [
  { metric: 'netArs', periodType: 'quarter', period: '2026-Q1', target: 3000, unit: 'Todas', pointOfSale: 'Todas', family: 'Todas' },
  { metric: 'netArs', periodType: 'month', period: '2026-05', target: 100000, unit: 'Todas' },
  { metric: 'netArs', periodType: 'month', period: '2026-06', target: 5, unit: 'Resinplast' },
];

test('buckets por mes, trimestre y semestre', () => {
  assert.equal(bucketsFor(2026, 'month').length, 12);
  assert.deepEqual(bucketsFor(2026, 'quarter')[1].months, ['2026-04', '2026-05', '2026-06']);
  assert.equal(bucketsFor(2026, 'semester')[1].months.length, 6);
});

test('serie trimestral con objetivo y porcentaje; ignora otros años', () => {
  const s = salesSeries(sales, goals, { year: 2026, granularity: 'quarter', metric: 'netArs' });
  assert.equal(s[0].value, 1500);
  assert.equal(s[0].target, 3000);
  assert.equal(s[0].pct, 50);
  assert.equal(s[1].value, 200000);
  assert.equal(s[1].target, 100000);
  assert.equal(s[1].pct, 200);
  assert.equal(s[3].value, 0);
});

test('el semestre suma los trimestres y los objetivos con alcance propio no entran', () => {
  const s = salesSeries(sales, goals, { year: 2026, granularity: 'semester', metric: 'netArs' });
  assert.equal(s[0].value, 201500);
  assert.equal(s[0].target, 103000);
  const byUnit = salesSeries(sales, goals, { year: 2026, granularity: 'month', metric: 'count', unit: 'Resinplast' });
  assert.equal(byUnit[0].value, 1);
  assert.equal(byUnit[0].target, null);
});

test('años disponibles y resumen', () => {
  assert.deepEqual(availableYears(sales, goals, new Date('2026-10-16')), ['2026', '2025']);
  const sum = seriesSummary(salesSeries(sales, goals, { year: 2026, granularity: 'quarter', metric: 'netArs' }), 'netArs');
  assert.equal(sum.total, 201500);
  assert.equal(sum.best.label, 'T2');
});
