import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteConversion } from '../src/quote-conversion.mjs';

test('cotizaciones: cerradas con factura dentro de 60 días, perdidas y en curso', () => {
  const rows = [
    { company: 'POLIPLAST', tipo: 'COT', fecha: '2026-06-01', cliente_id: '1', total: 100 },
    { company: 'POLIPLAST', tipo: 'FCA', fecha: '2026-06-11', cliente_id: '1', total: 100 },
    { company: 'POLIPLAST', tipo: 'COT', fecha: '2026-05-01', cliente_id: '2', total: 50 },
    { company: 'POLIPLAST', tipo: 'FCA', fecha: '2026-09-01', cliente_id: '2', total: 50 },
    { company: 'FOAMFACTORY', tipo: 'COT', fecha: '2026-10-10', cliente_id: '3', total: 70 },
    { company: 'POLIPLAST', tipo: 'COT', fecha: '2020-01-01', cliente_id: '4', total: 70 },
  ];
  const stats = quoteConversion(rows, { today: '2026-10-22' });
  assert.equal(stats.quotes, 3);
  assert.equal(stats.closed, 1);
  assert.equal(stats.lost, 1, 'la factura a los 123 días no cuenta como cierre');
  assert.equal(stats.pending, 1);
  assert.equal(stats.rate, 50);
  assert.equal(stats.medianDays, 10);
  assert.equal(stats.byCompany.find((group) => group.key === 'POLIPLAST').rate, 50);
});
