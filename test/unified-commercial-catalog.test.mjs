import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCatalogVariant,
  catalogIntegrityReport,
  filterCatalog,
  groupProductsWithVariants,
  resolveDocumentBrand,
  suggestTechnicalDocuments,
} from '../src/unified-commercial-catalog.mjs';

const items = [
  { sku: 'RE-608-150', brand: 'Resinplast', family: 'Resinas', subfamily: 'Epoxi', base: 'Poxiplast', variant: '150 g', priceStatus: 'vigente' },
  { sku: 'RE-608-300', brand: 'Resinplast', family: 'Resinas', subfamily: 'Epoxi', base: 'Poxiplast', variant: '300 g', priceStatus: 'vigente' },
  { sku: 'PS-PU46-1', brand: 'Penosil', family: 'Selladores', subfamily: 'Espumas', base: 'PU-46', variant: 'x1' },
];

test('normaliza una variante sin perder su jerarquia', () => {
  const item = buildCatalogVariant(items[0]);
  assert.equal(item.brand, 'RESINPLAST');
  assert.equal(item.productName, 'Poxiplast');
  assert.equal(item.variantName, '150 g');
});

test('agrupa variantes bajo un solo producto', () => {
  const groups = groupProductsWithVariants(items);
  const poxiplast = groups.find((group) => group.productName === 'Poxiplast');
  assert.equal(groups.length, 2);
  assert.equal(poxiplast.variants.length, 2);
});

test('filtra por texto, familia y subfamilia sin depender de mayusculas o tildes', () => {
  assert.equal(filterCatalog(items, { query: 'poxiplast' }).length, 2);
  assert.equal(filterCatalog(items, { brand: 'penosil', subfamily: 'espumas' }).length, 1);
  assert.equal(filterCatalog(items, { family: 'resinas', priceStatus: 'vigente' }).length, 2);
});

test('bloquea importaciones con SKU repetido o ausente', () => {
  const report = catalogIntegrityReport([...items, { ...items[0], name: 'Duplicado' }, { name: 'Sin SKU' }]);
  assert.equal(report.canImport, false);
  assert.equal(report.duplicateSkus[0].sku, 'RE-608-150');
  assert.equal(report.missingSku.length, 1);
});

test('usa co-branding para una marca y Grupo Poliplast para una seleccion mixta', () => {
  assert.deepEqual(resolveDocumentBrand(items.slice(0, 2)).secondary, ['RESINPLAST']);
  const mixed = resolveDocumentBrand(items);
  assert.equal(mixed.primary, 'GRUPO POLIPLAST');
  assert.equal(mixed.mixed, true);
  assert.deepEqual(mixed.secondary, []);
});

test('sugiere solo fichas vigentes por SKU, producto o subfamilia', () => {
  const documents = [
    { id: 'sku', status: 'vigente', sku: 'RE-608-150' },
    { id: 'family', status: 'vigente', family: 'Resinas', subfamily: 'Epoxi', appliesToSubfamily: true },
    { id: 'old', status: 'desactualizado', sku: 'RE-608-150' },
    { id: 'other', status: 'vigente', family: 'Pisos', subfamily: 'Goma', appliesToSubfamily: true },
  ];
  assert.deepEqual(suggestTechnicalDocuments(items[0], documents).map((document) => document.id), ['sku', 'family']);
});
