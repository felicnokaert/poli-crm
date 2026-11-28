import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet, contabiliumIndex, salesIndex, facets, filterSheet, isNotProduct, paginate, reviewList, sortSheet } from '../src/stock-sheet.mjs';

const detail = { companies: {
  POLIOCHO: { items: { 'SP-618': { n: '', d: { vd: 880, mdq: 220 } }, 'FLETE-1': { n: 'FLETE A CLIENTE', d: { vd: 3 } }, ZZ9: { n: '', d: { vd: 5 } }, CERO: { n: '', d: { vd: 0 } } } },
  FOAMFACTORY: { items: { 'BLBL-20-1': { n: '', d: { vd: 40 } }, 'SP-618': { n: '', d: { vd: 0 } } } },
  POLIPLAST: { items: {} },
} };
const catalog = [
  { sku: 'SP-618', name: '618 SP', family: 'POLIURETANOS', subfamily: 'Rígidos' },
  { sku: 'BLBL-20-1', name: 'Balde 20 L blanco', family: 'Baldes', subfamily: '' },
  { sku: 'RE-608-1', name: 'Resina epoxi 608', family: 'RESINPLAST', subfamily: 'Resinas Epoxi' },
];
const products = [
  { sku: 'SP-618', name: '618 SP', category: 'Espumas', vd: { count: 4, kgNow: 880, at: '2026-11-20T09:00' }, mdq: { count: 1, kgNow: 220, at: '2026-11-21T10:00' }, status: 'hay' },
  { sku: 'BLBL-20-1', name: 'Balde', category: 'Baldes', vd: { count: 0, kgNow: null, at: '2026-11-19T08:00' }, mdq: null, status: 'sin' },
  { sku: 'VIEJO-1', name: 'Contado sin catálogo', category: 'Otros', vd: { count: 2, at: '2026-11-18T08:00' }, mdq: null, status: 'hay' },
];

test('Stock: Contabilium por código suma las empresas y guarda en cuáles está', () => {
  const cb = contabiliumIndex(detail);
  assert.deepEqual(cb.get('SP-618'), { vd: 880, mdq: 220, companies: ['POLIOCHO', 'FOAMFACTORY'], name: '', total: 1100 });
  assert.equal(cb.get('BLBL-20-1').mdq, null);
});

test('Stock: la hoja tiene TODO el catálogo activo + lo contado fuera del catálogo; Contabilium suelto va a Revisar', () => {
  const cb = contabiliumIndex(detail);
  const sheet = buildSheet({ catalog, products, cb });
  assert.equal(sheet.length, 4);
  const epoxi = sheet.find((row) => row.sku === 'RE-608-1');
  assert.equal(epoxi.status, 'sin-conteo');
  assert.equal(epoxi.counted, false);
  const viejo = sheet.find((row) => row.sku === 'VIEJO-1');
  assert.equal(viejo.inCatalog, false);
  assert.equal(viejo.family, 'Contado, fuera del catálogo');
  assert.equal(sheet.find((row) => row.sku === 'SP-618').lastAt, '2026-11-21T10:00');
  const review = reviewList(cb, sheet);
  assert.deepEqual(review.map((row) => row.sku), ['ZZ9']); // FLETE fuera (no es producto), CERO fuera (sin stock)
});

test('Stock: no son productos (impuestos, fletes, envíos, cheques, «(carrozados)»)', () => {
  for (const name of ['IMPUESTO INTERNO', 'Flete a Mar del Plata', 'ENVÍO', 'Cheque rechazado', 'NO SIRVE', 'Gastos bancarios', 'Plancha PU (CARROZADOS)']) assert.equal(isNotProduct(name), true, name);
  for (const name of ['Resina R11 carrozados', 'Bola de válvula de retención', 'Balde 20 L']) assert.equal(isNotProduct(name), false, name);
});

test('Stock: filtros, orden (vacíos al final) y páginas de 30', () => {
  const sheet = buildSheet({ catalog, products, cb: contabiliumIndex(detail) });
  assert.deepEqual(filterSheet(sheet, { company: 'FOAMFACTORY' }).map((row) => row.sku).sort(), ['BLBL-20-1', 'SP-618']);
  assert.deepEqual(filterSheet(sheet, { family: 'RESINPLAST' }).map((row) => row.sku), ['RE-608-1']);
  assert.deepEqual(filterSheet(sheet, { status: 'falta' }).map((row) => row.sku), ['BLBL-20-1']);
  assert.deepEqual(filterSheet(sheet, { query: 'rigidos' }).map((row) => row.sku), ['SP-618']);
  assert.deepEqual(sortSheet(sheet, 'cbVd', 'desc').map((row) => row.sku).slice(0, 2), ['SP-618', 'BLBL-20-1']);
  const asc = sortSheet(sheet, 'cbVd', 'asc').map((row) => row.sku);
  assert.deepEqual(asc.slice(0, 2), ['BLBL-20-1', 'SP-618']);
  const many = Array.from({ length: 65 }, (_, index) => ({ sku: `X${index}` }));
  assert.deepEqual([paginate(many, 1).rows.length, paginate(many, 3).rows.length, paginate(many, 9).page, paginate(many, 1).pages], [30, 5, 3, 3]);
  const f = facets(sheet);
  assert.deepEqual(f.families, ['Baldes', 'Contado, fuera del catálogo', 'POLIURETANOS', 'RESINPLAST']);
  assert.deepEqual(f.subfamilies('RESINPLAST'), ['Resinas Epoxi']);
  assert.deepEqual(f.companies, ['FOAMFACTORY', 'POLIOCHO']);
});

test('Stock: con ventas por código, columnas de 6/12 meses, filtro obsoleto y Revisar ordenado por ventas', () => {
  const cb = contabiliumIndex(detail);
  const sales = salesIndex([{ codigo: 'sp-618', unidades_6m: 3, unidades_12m: 10, ultima_venta: '2026-11-20' }, { codigo: 'NUEVO-1', nombre: 'Producto nuevo', unidades_6m: 4, unidades_12m: 8, ultima_venta: '2026-11-01' }, { codigo: 'IMP', nombre: 'IMPUESTO INTERNO', unidades_12m: 50 }]);
  const sheet = buildSheet({ catalog, products, cb, sales });
  assert.equal(sheet.find((row) => row.sku === 'SP-618').sales12, 10);
  assert.equal(sheet.find((row) => row.sku === 'RE-608-1').sales12, 0);
  assert.deepEqual(filterSheet(sheet, { status: 'obsoleto' }).map((row) => row.sku).sort(), ['BLBL-20-1', 'RE-608-1', 'VIEJO-1']);
  assert.deepEqual(filterSheet(sheet, { status: 'vende' }).map((row) => row.sku), ['SP-618']);
  assert.deepEqual(reviewList(cb, sheet, sales).map((row) => row.sku), ['NUEVO-1', 'ZZ9']);
  assert.equal(buildSheet({ catalog, products, cb }).find((row) => row.sku === 'SP-618').sales12, null);
});
