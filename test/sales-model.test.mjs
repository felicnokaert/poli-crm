import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateSale, normalizedSale, saleCommission, salesToCsv } from '../src/sales-model.mjs';

test('calcula 3% para Poliplast y 1% para Poliocho', () => {
  assert.equal(saleCommission({ unit: 'Poliplast', netAmount: 100000 }), 3000);
  assert.equal(saleCommission({ unit: 'Poliocho', netAmount: 100000 }), 1000);
});

test('normaliza los números de factura', () => {
  assert.deepEqual(normalizedSale({ unit: 'Poliocho', documentType: 'Factura', pointOfSale: '3', documentNumber: '42', netAmount: '100' }), {
    unit: 'Poliocho', documentType: 'Factura', pointOfSale: '0003', documentNumber: '00042', netAmount: 100, commission: 1, collected: false,
  });
});

test('detecta una venta duplicada por unidad, comprobante, punto de venta y número', () => {
  const sales = [{ id: '1', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042' }];
  assert.ok(duplicateSale(sales, { id: '2', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042' }));
  assert.equal(duplicateSale(sales, { id: '1', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042' }), undefined);
  assert.equal(duplicateSale(sales, { id: '3', unit: 'Poliocho', documentType: 'Factura', pointOfSale: '0003', documentNumber: '00042' }), undefined);
});

test('exporta ventas a CSV con la comisión calculada', () => {
  const csv = salesToCsv([
    { date: '2026-09-01', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042', customer: 'Cliente A', netAmount: 100000, notes: '', collected: true },
  ]);
  assert.match(csv, /Fecha;Unidad;Comprobante;Punto de venta;Número;Cliente;Importe neto sin IVA;Comisión;¿Se cobró\?;Notas/);
  assert.match(csv, /2026-09-01;Poliplast;Factura;0006;00042;Cliente A;100000;3000;Sí;/);
});
