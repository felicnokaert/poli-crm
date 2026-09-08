import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGoalProgress, duplicateSale, netAmountInArs, netAmountInUsd, normalizedSale, pointOfSaleMapFrom, quarterKey, saleCommission, salesToCsv, unitsMapFrom } from '../src/sales-model.mjs';

test('calcula 3% para Poliplast y 1% para Poliocho', () => {
  assert.equal(saleCommission({ unit: 'Poliplast', netAmount: 100000 }), 3000);
  assert.equal(saleCommission({ unit: 'Poliocho', netAmount: 100000 }), 1000);
});

test('mantiene las comisiones historicas si el workspace todavia no tiene unidades configuradas', () => {
  assert.equal(saleCommission({ unit: 'Poliplast', netAmount: 100000 }, {}), 3000);
  assert.equal(saleCommission({ unit: 'Poliocho', netAmount: 100000 }, {}), 1000);
});

test('ofrece las unidades historicas al registrar una venta en un workspace antiguo', () => {
  assert.deepEqual(Object.keys(unitsMapFrom([])), ['Poliplast', 'Poliocho']);
  assert.equal(unitsMapFrom([]).Poliplast.rate, 0.03);
  assert.deepEqual(unitsMapFrom([]).Poliocho.invoicePoints, ['0003']);
});

test('pointOfSaleMapFrom lets a newly added business unit be recognized when importing PDFs', () => {
  const units = unitsMapFrom([
    { name: 'Poliplast', ratePct: 3, invoicePoints: ['0006', '0011'] },
    { name: 'Imperpur', ratePct: 3, invoicePoints: ['0009'] },
  ]);
  const map = pointOfSaleMapFrom(units);
  assert.equal(map['0009'], 'Imperpur');
  assert.equal(map['0006'], 'Poliplast');
});

test('pointOfSaleMapFrom ignores empty point-of-sale placeholders', () => {
  const units = unitsMapFrom([{ name: 'Sin puntos', ratePct: 3, invoicePoints: [] }]);
  const map = pointOfSaleMapFrom(units);
  assert.deepEqual(map, {});
});

test('normaliza los números de factura', () => {
  assert.deepEqual(normalizedSale({ unit: 'Poliocho', documentType: 'Factura', pointOfSale: '3', documentNumber: '42', netAmount: '100' }), {
    unit: 'Poliocho', documentType: 'Factura', pointOfSale: '0003', documentNumber: '00042', netAmount: 100, currency: 'ARS', exchangeRate: 0, commission: 1, collected: false,
  });
});

test('calcula la comisión sobre el equivalente en pesos cuando la factura es en dólares', () => {
  const sale = { unit: 'Poliplast', netAmount: 1000, currency: 'USD', exchangeRate: 1500 };
  assert.equal(netAmountInArs(sale), 1500000);
  assert.equal(saleCommission(sale), 45000);
});

test('ignora el tipo de cambio si la venta ya está en pesos', () => {
  const sale = { unit: 'Poliplast', netAmount: 1000, currency: 'ARS', exchangeRate: 1500 };
  assert.equal(netAmountInArs(sale), 1000);
});

test('calcula el trimestre a partir de la fecha', () => {
  assert.equal(quarterKey('2026-01-15'), '2026-Q1');
  assert.equal(quarterKey('2026-04-01'), '2026-Q2');
  assert.equal(quarterKey('2026-09-03'), '2026-Q3');
  assert.equal(quarterKey('2026-12-31'), '2026-Q4');
  assert.equal(quarterKey(''), '');
});

test('detecta una venta duplicada por unidad, comprobante, punto de venta y número', () => {
  const sales = [{ id: '1', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042' }];
  assert.ok(duplicateSale(sales, { id: '2', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042' }));
  assert.equal(duplicateSale(sales, { id: '1', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042' }), undefined);
  assert.equal(duplicateSale(sales, { id: '3', unit: 'Poliocho', documentType: 'Factura', pointOfSale: '0003', documentNumber: '00042' }), undefined);
  assert.ok(duplicateSale(sales, { id: '2', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '6', documentNumber: '42' }));
});

test('exporta ventas a CSV con la comisión calculada', () => {
  const csv = salesToCsv([
    { date: '2026-09-01', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042', customer: 'Cliente A', netAmount: 100000, currency: 'ARS', notes: '', collected: true },
  ]);
  assert.match(csv, /Fecha;Unidad;Comprobante;Punto de venta;Número;Cliente;Importe neto sin IVA;Moneda;Tipo de cambio;Importe neto en pesos;Comisión;¿Se cobró\?;Notas/);
  assert.match(csv, /2026-09-01;Poliplast;Factura;0006;00042;Cliente A;100000;ARS;;100000;3000;Sí;/);
});

test('exporta el tipo de cambio y el equivalente en pesos para ventas en dólares', () => {
  const csv = salesToCsv([
    { date: '2026-09-01', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042', customer: 'Cliente USD', netAmount: 1000, currency: 'USD', exchangeRate: 1500, notes: '', collected: false },
  ]);
  assert.match(csv, /2026-09-01;Poliplast;Factura;0006;00042;Cliente USD;1000;USD;1500;1500000;45000;No;/);
});

test('computes count/net/commission progress filtered by unit and point of sale', () => {
  const sales = [
    { date: '2026-09-01', unit: 'Poliplast', pointOfSale: '0006', netAmount: 1000, currency: 'ARS' },
    { date: '2026-09-05', unit: 'Poliplast', pointOfSale: '0011', netAmount: 2000, currency: 'ARS' },
    { date: '2026-09-10', unit: 'Poliocho', pointOfSale: '0003', netAmount: 500, currency: 'ARS' },
    { date: '2026-08-01', unit: 'Poliplast', pointOfSale: '0006', netAmount: 9999, currency: 'ARS' },
  ];
  const countAll = computeGoalProgress(sales, { periodType: 'month', period: '2026-09', metric: 'count', unit: 'Todas', pointOfSale: 'Todas' });
  assert.equal(countAll, 3);
  const netPoliplast = computeGoalProgress(sales, { periodType: 'month', period: '2026-09', metric: 'netArs', unit: 'Poliplast', pointOfSale: 'Todas' });
  assert.equal(netPoliplast, 3000);
  const commissionPos = computeGoalProgress(sales, { periodType: 'month', period: '2026-09', metric: 'commission', unit: 'Poliplast', pointOfSale: '0006' });
  assert.equal(commissionPos, 30); // 1000 * 3%
});

test('converts ARS sales to USD using the goal fallback rate, but not USD sales', () => {
  assert.equal(netAmountInUsd({ netAmount: 1500, currency: 'ARS' }, 1500), 1);
  assert.equal(netAmountInUsd({ netAmount: 1000, currency: 'USD', exchangeRate: 1500 }, 1500), 1000);
  assert.equal(netAmountInUsd({ netAmount: 1500, currency: 'ARS' }, 0), 0);
});

test('goal progress in USD sums USD sales directly and converts ARS ones with the fallback rate', () => {
  const sales = [
    { date: '2026-09-01', unit: 'Poliplast', netAmount: 1000, currency: 'USD', exchangeRate: 1500 },
    { date: '2026-09-05', unit: 'Poliplast', netAmount: 1500, currency: 'ARS' },
  ];
  const usdProgress = computeGoalProgress(sales, { periodType: 'month', period: '2026-09', metric: 'netUsd', unit: 'Todas', pointOfSale: 'Todas', fallbackRate: 1500 });
  assert.equal(usdProgress, 1001);
});

test('goal progress respects the quarter period type', () => {
  const sales = [
    { date: '2026-07-15', unit: 'Poliplast', pointOfSale: '0006', netAmount: 100, currency: 'ARS' },
    { date: '2026-09-15', unit: 'Poliplast', pointOfSale: '0006', netAmount: 100, currency: 'ARS' },
    { date: '2026-10-01', unit: 'Poliplast', pointOfSale: '0006', netAmount: 100, currency: 'ARS' },
  ];
  const q3Count = computeGoalProgress(sales, { periodType: 'quarter', period: '2026-Q3', metric: 'count', unit: 'Todas', pointOfSale: 'Todas' });
  assert.equal(q3Count, 2);
});
