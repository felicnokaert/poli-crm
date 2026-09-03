import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedSale, saleCommission } from '../src/sales-model.mjs';

test('calcula 3% para Poliplast y 1% para Poliocho', () => {
  assert.equal(saleCommission({ unit: 'Poliplast', netAmount: 100000 }), 3000);
  assert.equal(saleCommission({ unit: 'Poliocho', netAmount: 100000 }), 1000);
});

test('normaliza los números de factura', () => {
  assert.deepEqual(normalizedSale({ unit: 'Poliocho', documentType: 'Factura', pointOfSale: '3', documentNumber: '42', netAmount: '100' }), {
    unit: 'Poliocho', documentType: 'Factura', pointOfSale: '0003', documentNumber: '00042', netAmount: 100, commission: 1,
  });
});
