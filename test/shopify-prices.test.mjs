import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCross, priceSummary, filterPriceRows, priceProposalCsv } from '../src/shopify-prices.mjs';

const products = [
  { id: 'p1', title: 'Resina Poxiplast', status: 'ACTIVE' }, { id: 'p2', title: 'Balde', status: 'ACTIVE' }, { id: 'p3', title: 'Pigmento', status: 'DRAFT' },
  { id: 'p4', title: 'Archivado', status: 'ARCHIVED' }, { id: 'p5', title: 'Kit', status: 'ACTIVE' },
];
const variants = [
  { id: 'v1', product_id: 'p1', title: '1 kg', sku: 're-608-1', price: 90000 }, // ML 100.000 → objetivo 90.000: bien
  { id: 'v2', product_id: 'p1', title: '3 kg', sku: 'RE-608-3', price: 160000 }, // ML 150.000 → objetivo 135.000: caro
  { id: 'v3', product_id: 'p2', title: 'Default Title', sku: 'BL-10', price: 10000 }, // ML 20.000 → objetivo 18.000: barato
  { id: 'v4', product_id: 'p2', title: 'x5', sku: 'BL-10-5', price: 1000 }, // diferencia enorme
  { id: 'v5', product_id: 'p3', title: 'Default Title', sku: 'PIG-1', price: 0 },
  { id: 'v6', product_id: 'p4', title: 'x', sku: 'RE-608-1', price: 1 }, // archivado: no cuenta
  { id: 'v7', product_id: 'p5', title: 'Default Title', sku: '', price: 5 },
  { id: 'v8', product_id: 'p5', title: 'Otro', sku: 'NO-ML', price: 5 },
  { id: 'v9', product_id: 'p5', title: 'Pausado', sku: 'PAUSA', price: 5 },
];
const mlItems = [
  { id: 'M1', sku: 'RE-608-1', price: 100000, status: 'active', sold_quantity: 10 },
  { id: 'M2', sku: 'RE-608-1', price: 80000, status: 'active', sold_quantity: 50 }, // la que más vendió es la referencia
  { id: 'M3', sku: 'RE-608-3', price: 150000, status: 'active', sold_quantity: 1 },
  { id: 'M4', sku: 'BL-10', price: 20000, status: 'active', sold_quantity: 3 },
  { id: 'M5', sku: 'BL-10-5', price: 20000, status: 'active', sold_quantity: 3 },
  { id: 'M6', sku: 'PIG-1', price: 5000, status: 'active', sold_quantity: 3 },
  { id: 'M7', sku: 'PAUSA', price: 9999, status: 'paused', sold_quantity: 3 },
];

test('cruce por SKU: referencia = la activa que más vendió, objetivo = ML menos 10 %', () => {
  const rows = priceCross({ products, variants, mlItems });
  const by = Object.fromEntries(rows.map((row) => [row.variantId, row]));
  assert.equal(by.v1.target, 72000); // 80.000 (la de M2) menos 10 %
  assert.equal(by.v1.state, 'alinear_bajar');
  assert.equal(by.v1.proposal, 72000);
  assert.equal(by.v2.state, 'alinear_bajar');
  assert.equal(by.v2.target, 135000);
  assert.equal(by.v3.state, 'alinear_subir');
  assert.equal(by.v3.proposal, 18000);
  assert.equal(by.v4.state, 'revisar');
  assert.equal(by.v4.proposal, null);
  assert.equal(by.v5.state, 'sin_precio');
  assert.equal(by.v6, undefined);
  assert.equal(by.v7.state, 'sin_sku');
  assert.equal(by.v8.state, 'sin_ml');
  assert.equal(by.v9.state, 'ml_inactiva');
});

test('dentro de ±2 % está bien; la tolerancia no marca cambios de centavos', () => {
  const rows = priceCross({ products: [products[0]], variants: [{ id: 'a', product_id: 'p1', title: 'x', sku: 'S', price: 90500 }], mlItems: [{ id: 'M', sku: 's', price: 100000, status: 'active', sold_quantity: 1 }] });
  assert.equal(rows[0].state, 'ok');
  assert.equal(rows[0].proposal, null);
});

test('resumen, filtros y CSV de la propuesta', () => {
  const rows = priceCross({ products, variants, mlItems });
  const summary = priceSummary(rows);
  assert.equal(summary.lower, 2);
  assert.equal(summary.raise, 1);
  assert.equal(summary.review, 1);
  assert.equal(summary.noSku, 1);
  assert.equal(summary.toChangeActive, 3); // v5 es borrador: no cuenta como activo
  assert.deepEqual(filterPriceRows(rows, { state: 'alinear_bajar' }).map((row) => row.variantId), ['v1', 'v2']);
  assert.equal(filterPriceRows(rows, { activeOnly: false }).some((row) => row.variantId === 'v5'), true);
  assert.equal(filterPriceRows(rows, { query: 'poxiplast 3' }).length, 1);
  const csv = priceProposalCsv(rows);
  assert.ok(csv.startsWith('﻿"SKU"'));
  assert.equal(csv.split('\n').length, 1 + 5); // v1, v2, v3 y v5 llevan propuesta; v4 (diferencia enorme) va marcado para revisar a mano
  assert.match(csv, /"Bajar precio y tachar el de ML"/);
  assert.match(csv, /Revisar a mano/);
  assert.match(csv, /"Precio de comparación a cargar \(= ML\)"/);
});
