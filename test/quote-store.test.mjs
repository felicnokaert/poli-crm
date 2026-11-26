import test from 'node:test';
import assert from 'node:assert/strict';
import { itemRows, linesFromItems, quoteNumber, quoteRow, quoteSummary } from '../src/quote-store.js';
import { businessDaysFromToday } from '../src/quote-model.mjs';

const row = { list: 'Catalogo', wholesale: false, from: 1, to: null, gross: 121, net: 100, vat: 0.21, currency: 'USD' };

test('Cotizaciones: se guardan con la foto del precio y vuelven congeladas', () => {
  const quote = quoteRow({ number: 'PA-261126-1234', userId: 'u1', client: 'Sur SRL', mode: 'mayorista', payment: { id: 'contado', discount_percent: 5 }, validDays: 15, dollar: { rate: 1500 }, status: 'enviada' });
  assert.equal(quote.price_mode, 'mayorista');
  assert.equal(quote.discount_percent, 5);
  const items = itemRows('q1', [{ id: 'v1', name: 'PU-46', sku: 'PU-46', quantity: 2, mode: 'minorista', row, rows: [row] }, { name: 'sin precio', row: null }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit_amount, 121);
  const lines = linesFromItems(items.map((item, index) => ({ ...item, id: `i${index}`, active: true })));
  assert.equal(lines[0].frozenRow.gross, 121);
  const summary = quoteSummary({ ...quote, issued_at: '2026-11-26T15:00:00Z' }, items);
  assert.equal(Math.round(summary.totals.gross), 230); // 242 con 5 % de descuento
  assert.equal(summary.expires, '2026-12-11');
});

test('Cotizaciones: número con fecha y seguimiento a 2 días hábiles', () => {
  assert.match(quoteNumber(new Date('2026-11-26T15:00:00Z'), () => 0.5), /^PA-261126-\d{4}$/);
  // Jueves 26/11 → lunes 30/11 (salta sábado y domingo).
  assert.equal(businessDaysFromToday(2, Date.parse('2026-11-26T15:00:00Z')), '2026-11-30');
});
