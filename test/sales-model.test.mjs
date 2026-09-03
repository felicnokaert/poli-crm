import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedSale, saleCommission, salesToCsv } from '../src/sales-model.mjs';

test('calcula 3% para Poliplast y 1% para Poliocho', () => {
  assert.equal(saleCommission({ unit: 'Poliplast', netAmount: 100000 }), 3000);
  assert.equal(saleCommission({ unit: 'Poliocho', netAmount: 100000 }), 1000);
});

test('normaliza los números de factura', () => {
  assert.deepEqual(normalizedSale({ unit: 'Poliocho', documentType: 'Factura', pointOfSale: '3', documentNumber: '42', netAmount: '100' }), {
    unit: 'Poliocho', documentType: 'Factura', pointOfSale: '0003', documentNumber: '00042', netAmount: 100, commission: 1,
  });
});

test('exporta ventas a CSV con la comisión calculada', () => {
  const csv = salesToCsv([
    { date: '2026-09-01', unit: 'Poliplast', documentType: 'Factura', pointOfSale: '0006', documentNumber: '00042', customer: 'Cliente A', netAmount: 100000, notes: '' },
  ]);
  assert.match(csv, /Fecha;Unidad;Comprobante;Punto de venta;Número;Cliente;Importe neto sin IVA;Comisión;Notas/);
  assert.match(csv, /2026-09-01;Poliplast;Factura;0006;00042;Cliente A;100000;3000;/);
});
