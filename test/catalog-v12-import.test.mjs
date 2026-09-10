import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptCatalogV12 } from '../src/catalog-v12-import.mjs';

const headers = [
  'Tipo', 'SKU', 'Nombre', 'Familia', 'Subfamilia', 'Rubro', 'Sub Rubro', 'Confianza',
  'Es_servicio', 'Nota', 'Costo USD vigente', 'Precio Final USD', 'Markup sobre costo %',
  'Margen sobre venta %', 'Valor estratégico', 'Estado costo', 'Es_variante',
  'Publico_objetivo', 'Publico_objetivo_detalle',
];

test('adapta v12 sin convertir precio final en precio mayorista', () => {
  const result = adaptCatalogV12({
    currentMatrix: [headers, ['Producto', ' pen-1 ', 'Sellador', 'PENOSIL', 'Selladores', '', '', 'Alta', 'No', '', 4, 10, 1.5, 0.6, '', 'Lista 2026', 'Sí', 'Construcción', 'Aplicadores']],
    excludedMatrix: [['Tipo', 'SKU', 'Nombre', 'Motivo_exclusion', 'Rubro', 'Sub Rubro'], ['Producto', 'X-1', 'Interno', 'No comercial', '', '']],
    source: { fileId: 'drive-1', importedAt: '2026-09-10T12:00:00Z' },
  });
  assert.deepEqual(result.summary, { current: 1, excluded: 1, costsPresent: 1, finalPricesPresent: 1, wholesalePricesVerified: 0, errors: 0, warnings: 0 });
  assert.equal(result.catalogRows[0].sku, 'PEN-1');
  assert.equal(result.costRows[0].cost, 4);
  assert.equal(result.priceRows[0].price, 10);
  assert.equal(result.priceRows[0].commercialLevel, 'sin_clasificar');
  assert.equal(result.excludedRows[0].active, false);
});

test('bloquea SKU repetido y advierte costos pendientes o marcados para revisión', () => {
  const base = ['Producto', 'ABC', 'Producto', 'Otros', 'Varios', '', '', '', 'No', '', '', 12, '', '', '', 'REVISAR DUPLICADO', 'No', '', ''];
  const duplicate = [...base];
  const result = adaptCatalogV12({ currentMatrix: [headers, base, duplicate] });
  assert.equal(result.summary.current, 1);
  assert.deepEqual(result.errors.map((item) => item.code), ['sku_duplicado']);
  assert.deepEqual(result.warnings.map((item) => item.code), ['costo_pendiente', 'costo_marcado_revisar_duplicado']);
});

test('rechaza una matriz que no sea el formato canónico v12', () => {
  const result = adaptCatalogV12({ currentMatrix: [['SKU', 'Nombre'], ['A', 'Uno']] });
  assert.equal(result.errors[0].code, 'encabezados_faltantes');
  assert.ok(result.errors[0].headers.includes('Familia'));
});
