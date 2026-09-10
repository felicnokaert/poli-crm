import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminImportSummary,
  canApplyAdminImport,
  exportableCatalogRow,
  previewCatalogAdminImport,
} from '../src/catalog-admin-import.mjs';

test('una actualización masiva de costos separa cambios y filas iguales', () => {
  const existing = [
    { sku: 'ABC-1', cost: 100, costCurrency: 'USD', costSource: 'Lista A', costValidFrom: '2026-09-01' },
    { sku: 'ABC-2', cost: 200, costCurrency: 'USD', costSource: 'Lista A', costValidFrom: '2026-09-01' },
  ];
  const preview = previewCatalogAdminImport({
    type: 'costos',
    existing,
    rows: [
      { sku: 'abc-1', cost: 120, costCurrency: 'USD', costSource: 'Lista B', costValidFrom: '2026-09-10' },
      { sku: 'ABC-2', cost: 200, costCurrency: 'USD', costSource: 'Lista A', costValidFrom: '2026-09-01' },
    ],
  });
  assert.deepEqual(adminImportSummary(preview), { altas: 0, cambios: 1, sinCambios: 1, conflictos: 0, errores: 0 });
  assert.deepEqual(preview.cambios[0].changedFields, ['cost', 'costSource', 'costValidFrom']);
  assert.equal(canApplyAdminImport(preview), true);
});

test('un SKU desconocido no puede crear costos o stock silenciosamente', () => {
  const preview = previewCatalogAdminImport({ type: 'costos', rows: [{ sku: 'NUEVO', cost: 10, costCurrency: 'USD' }] });
  assert.deepEqual(preview.errores[0].errors, ['sku_desconocido']);
  assert.equal(canApplyAdminImport(preview), false);
});

test('un SKU repetido en el lote queda como conflicto y no se aplica', () => {
  const existing = [{ sku: 'ABC-1', cost: 100, costCurrency: 'USD' }];
  const preview = previewCatalogAdminImport({
    type: 'costos',
    existing,
    rows: [
      { sku: 'ABC-1', cost: 110, costCurrency: 'USD' },
      { sku: 'abc-1', cost: 120, costCurrency: 'USD' },
    ],
  });
  assert.equal(preview.conflictos.length, 2);
  assert.equal(canApplyAdminImport(preview), false);
});

test('una carga de stock exige depósito fecha cantidad y SKU conocido', () => {
  const existing = [{ sku: 'ABC-1' }];
  const preview = previewCatalogAdminImport({
    type: 'stock',
    existing,
    rows: [{ sku: 'ABC-1', locationId: '', quantity: -1, countedAt: '' }],
  });
  assert.deepEqual(preview.errores[0].errors, ['deposito_faltante', 'cantidad_stock_invalida', 'fecha_conteo_faltante']);
});

test('la exportación de vendedor nunca incluye costo ni rentabilidad', () => {
  const row = { sku: 'ABC-1', name: 'Producto', price: 150, cost: 100, effectiveMarginRate: 1 / 3 };
  assert.equal('cost' in exportableCatalogRow(row), false);
  assert.equal('effectiveMarginRate' in exportableCatalogRow(row), false);
  assert.equal(exportableCatalogRow(row, { canViewCosts: true }).cost, 100);
});
