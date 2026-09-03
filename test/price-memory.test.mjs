import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPriceMemory, findPriceMatches, quotePrice } from '../src/price-memory.mjs';

const SALES = [
  { date: '2026-09-01', customer: 'Cliente Viejo', unit: 'Poliplast', currency: 'USD', items: [{ description: 'KIT DE POLIURETANO', code: 'KIT1', unitPrice: 2000 }] },
  { date: '2026-09-03', customer: 'Cliente Nuevo', unit: 'Poliplast', currency: 'USD', items: [{ description: 'KIT DE POLIURETANO', code: 'KIT1', unitPrice: 2385 }] },
  { date: '2026-09-02', customer: 'Otro', unit: 'Poliocho', currency: 'ARS', items: [{ description: 'EASY SPRAY 750ML', code: 'ES750', unitPrice: 12000 }] },
];

test('keeps the most recent price when a product was sold more than once', () => {
  const memory = buildPriceMemory(SALES);
  const [match] = findPriceMatches(memory, 'kit poliuretano');
  assert.equal(match.unitPrice, 2385);
  assert.equal(match.date, '2026-09-03');
});

test('matches by any word order and partial terms', () => {
  const memory = buildPriceMemory(SALES);
  assert.equal(findPriceMatches(memory, 'poliuretano kit').length, 1);
  assert.equal(findPriceMatches(memory, 'easy spray').length, 1);
  assert.equal(findPriceMatches(memory, 'algo que no vendimos nunca').length, 0);
});

test('quotes unit price times quantity, matching the "si piden 3" example', () => {
  const memory = buildPriceMemory(SALES);
  const [match] = findPriceMatches(memory, 'kit de poliuretano');
  const quote = quotePrice(match, 3);
  assert.equal(quote.unitPrice, 2385);
  assert.equal(quote.total, 7155);
  assert.equal(quote.currency, 'USD');
});

test('ignores items without a positive unit price', () => {
  const memory = buildPriceMemory([
    { date: '2026-09-01', currency: 'ARS', items: [{ description: 'Impuesto Interno', unitPrice: 0 }] },
  ]);
  assert.equal(memory.size, 0);
});
