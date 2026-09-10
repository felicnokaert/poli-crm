import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crossPriceRowsWithCatalog,
  priceCrossSummary,
  rowsApprovedForPriceImport,
} from '../src/catalog-price-cross.mjs';

test('solo importa coincidencias exactas o aliases aprobados explícitamente', () => {
  const result = crossPriceRowsWithCatalog({
    catalogRows: [{ sku: 'PS-EPP995-1', name: 'Eliminador 995' }, { sku: 'R-11', name: 'Resina' }],
    priceRows: [
      { sourceSku: ' r-11 ', priceList: 'Mayorista', price: 4.3, unit: 'kg' },
      { sourceSku: 'PS-EEP995-1', priceList: 'Penosil', price: 12.5, unit: 'unidad' },
      { sourceSku: 'DESCONOCIDO', priceList: 'Mayorista', price: 10, unit: 'unidad' },
    ],
    skuAliases: { 'PS-EEP995-1': 'PS-EPP995-1' },
  });
  assert.deepEqual(priceCrossSummary(result), { exact: 1, aliased: 1, unresolved: 1, conflicts: 0, errors: 0, importable: 2 });
  assert.deepEqual(rowsApprovedForPriceImport(result).map((row) => row.sku), ['R-11', 'PS-EPP995-1']);
});

test('un nombre parecido nunca fusiona productos sin SKU o alias', () => {
  const result = crossPriceRowsWithCatalog({
    catalogRows: [{ sku: 'GC1010-1', name: 'Gelcoat negro ortof' }],
    priceRows: [{ sourceSku: 'GC1010', name: 'Gelcoat negro', priceList: 'Mayorista', price: 6.6 }],
  });
  assert.equal(result.aliased.length, 0);
  assert.equal(result.unresolved[0].reason, 'sku_sin_coincidencia');
});

test('detecta una escala de precio repetida dentro de la misma fuente', () => {
  const row = { sourceSku: 'R-11', priceList: 'Consumidor final', minQuantity: 1, unit: 'kg', price: 7.33 };
  const result = crossPriceRowsWithCatalog({ catalogRows: [{ sku: 'R-11' }], priceRows: [row, { ...row, price: 8 }] });
  assert.equal(result.exact.length, 1);
  assert.equal(result.conflicts.length, 1);
});
