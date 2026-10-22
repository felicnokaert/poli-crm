import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asksPrice, currentListPrices, priceLine, priceWords, pricesContext } from '../src/assistant-prices.mjs';

test('precios: entiende la pregunta y saca las palabras del producto', () => {
  assert.ok(asksPrice('¿cuánto sale el easyspray x12?'));
  assert.ok(asksPrice('precio de la resina epoxi 1 kg'));
  assert.ok(!asksPrice('cuánto rinde el easyspray'));
  assert.deepEqual(priceWords('¿cuánto sale el easyspray x12?'), ['easyspray', 'x12']);
});

test('precios: solo listas vigentes y confirmadas, final con IVA y neto + IVA, consumidor antes que mayorista', () => {
  const lists = [
    { id: 'c', name: 'Consumidor final', currency: 'USD', vat_rate: 0.21, valid_from: '2026-10-01', valid_until: null, status: 'vigente' },
    { id: 'm', name: 'Mayorista', currency: 'USD', vat_rate: 0.21, valid_from: '2026-10-01', valid_until: null, status: 'vigente' },
    { id: 'v', name: 'Vieja', currency: 'USD', vat_rate: 0.21, valid_from: '2025-01-01', valid_until: '2025-12-31', status: 'vencida' },
  ];
  const prices = [
    { price_list_id: 'm', variant_id: 'x', min_quantity: 12, max_quantity: null, amount: 96.8, status: 'confirmado' },
    { price_list_id: 'c', variant_id: 'x', min_quantity: 1, max_quantity: null, amount: 121, status: 'confirmado' },
    { price_list_id: 'v', variant_id: 'x', min_quantity: 1, max_quantity: null, amount: 50, status: 'confirmado' },
    { price_list_id: 'c', variant_id: 'y', min_quantity: 1, max_quantity: null, amount: 10, status: 'pendiente' },
  ];
  const entries = currentListPrices({ variants: [{ id: 'x', sku: 'ES12', name: 'Easyspray x12' }, { id: 'y', name: 'Sin precio' }], prices, lists, today: '2026-10-22' });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].rows.map((row) => row.list), ['Consumidor final', 'Mayorista']);
  assert.match(priceLine(entries[0].rows[0]), /USD 121,00 final · USD 100,00 \+ IVA 21 %/);
  assert.match(priceLine(entries[0].rows[1]), /desde 12 u\./);
  assert.match(pricesContext(entries), /PRECIOS DE LISTA VIGENTES[\s\S]*Easyspray x12 \[ES12\]/);
});
