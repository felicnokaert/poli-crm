import test from 'node:test';
import assert from 'node:assert/strict';
import { channelRefs, pickRow, quoteTotals, whatsappText, wholesaleWarnings } from '../src/quote-model.mjs';

const rows = [
  { list: 'Catalogo', wholesale: false, from: 1, to: null, gross: 121, net: 100, vat: 0.21, currency: 'USD' },
  { list: 'Penosil Mayorista', wholesale: true, from: 1, to: 11, gross: 96.8, net: 80, vat: 0.21, currency: 'USD' },
  { list: 'Penosil Mayorista', wholesale: true, from: 12, to: null, gross: 84.7, net: 70, vat: 0.21, currency: 'USD' },
];

test('Cotizador: elige lista y tramo por cantidad', () => {
  assert.equal(pickRow(rows, 'minorista', 5).gross, 121);
  assert.equal(pickRow(rows, 'mayorista', 5).gross, 96.8);
  assert.equal(pickRow(rows, 'mayorista', 12).gross, 84.7);
  // Sin lista mayorista: cae en la que haya y lo avisa.
  const onlyRetail = pickRow(rows.slice(0, 1), 'mayorista', 3);
  assert.equal(onlyRetail.gross, 121);
  assert.equal(onlyRetail.fallback, true);
});

test('Cotizador: totales con forma de pago y aviso de mínimo mayorista', () => {
  const lines = [{ quantity: 10, mode: 'mayorista', brand: 'Penosil', row: pickRow(rows, 'mayorista', 10) }];
  const totals = quoteTotals(lines, { payment: { discount_percent: 10 } });
  assert.equal(Math.round(totals.net), 720);
  const warnings = wholesaleWarnings(lines, [{ brand: 'Penosil', threshold_net_usd: 1800, active: true }]);
  assert.equal(warnings.length, 1);
  assert.equal(Math.round(warnings[0].missing), 1000);
});

test('Cotizador: texto para WhatsApp sin inventar y referencias de canales por SKU', () => {
  const lines = [{ quantity: 2, name: 'Espuma PU-46', sku: 'PU-46', mode: 'minorista', row: rows[0] }];
  const text = whatsappText({ client: 'Aislaciones Sur', lines, totals: quoteTotals(lines), dollar: { rate: 1500 } });
  assert.match(text, /Aislaciones Sur/);
  assert.match(text, /USD 242,00/);
  assert.match(text, /\$ 363\.000/);
  const refs = channelRefs('pu-46', { mlItems: [{ status: 'active', sku: 'PU-46', price: 30000, sold_quantity: 5 }, { status: 'paused', sku: 'PU-46', price: 1, sold_quantity: 99 }], shopVariants: [{ sku: 'PU-46', price: 27000 }] });
  assert.equal(refs.ml.price, 30000);
  assert.equal(refs.shopify.price, 27000);
});

test('Cotizador: ⚠ precio raro cuando ML o Shopify están a menos de la mitad o más de 2,5 veces de la lista', async () => {
  const { rarePrice } = await import('../src/quote-model.mjs');
  const rows = [{ wholesale: false, from: 1, to: null, gross: 10, net: 8.26, list: 'Maestro' }];
  assert.equal(rarePrice({ rows, refs: { ml: { price: 15000 } } }, 1000), null);
  assert.deepEqual(rarePrice({ rows, refs: { ml: { price: 40000 } } }, 1000), { channel: 'Mercado Libre', price: 40000, listArs: 10000, ratio: 4 });
  assert.equal(rarePrice({ rows, refs: { shopify: { price: 3000 } } }, 1000).channel, 'Shopify');
  assert.equal(rarePrice({ rows, refs: { ml: { price: 40000 } } }, null), null);
});
