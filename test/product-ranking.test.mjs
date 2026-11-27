import test from 'node:test';
import assert from 'node:assert/strict';
import { barWidths, catalogIndex, classify, rankingCsv, rankItems, sinceDate } from '../src/product-ranking.mjs';
import { itemRows, saleSign } from '../lib/contabilium-items.mjs';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const catalog = catalogIndex([{ sku: 'IF-1517', name: '1517 ISO Visco Mol', family: 'Poliuretano', subfamily: 'Isocianatos' }]);
const items = [
  { company: 'POLIPLAST', fecha: '2026-11-20', signo: 1, codigo: 'IF-1517', nombre: 'iso', cantidad: 2, neto: 1000 },
  { company: 'POLIPLAST', fecha: '2026-11-21', signo: 1, codigo: 'RE-608-750', nombre: 'Resina 750', cantidad: 10, neto: 300, rubro: 'Resinplast', subrubro: 'Epoxi' },
  { company: 'POLIOCHO', fecha: '2026-11-22', signo: -1, codigo: 'IF-1517', nombre: 'iso', cantidad: 1, neto: 400 },
  { company: 'POLIPLAST', fecha: '2026-08-01', signo: 1, codigo: 'RE-608-750', nombre: 'Resina 750', cantidad: 50, neto: 5000, rubro: 'Resinplast', subrubro: 'Epoxi' },
  { company: 'POLIPLAST', fecha: '2026-11-22', signo: 0, codigo: 'X', nombre: 'nota de débito', cantidad: 1, neto: 99 },
];

test('FC y COT suman, NC y NCT restan, ND no entra', () => {
  assert.equal(saleSign('FCA'), 1);
  assert.equal(saleSign('COT'), 1);
  assert.equal(saleSign('NCB'), -1);
  assert.equal(saleSign('NCT'), -1);
  assert.equal(saleSign('NDA'), 0);
});

test('ranking de productos del último mes con notas de crédito restando', () => {
  const result = rankItems(items, { months: 1, now: NOW, catalog });
  assert.deepEqual(result.rows.map((row) => [row.sku, row.net, row.units]), [['IF-1517', 600, 1], ['RE-608-750', 300, 10]]);
  assert.equal(result.rows[0].label, '1517 ISO Visco Mol');
  assert.equal(result.rows[0].credits, 1);
  assert.equal(result.totalNet, 900);
});

test('6 meses incluye lo viejo; por unidades cambia el orden', () => {
  const result = rankItems(items, { months: 6, now: NOW, catalog, measure: 'unidades' });
  assert.equal(result.rows[0].sku, 'RE-608-750');
  assert.equal(result.rows[0].units, 60);
});

test('rubros y subrubros desde Contabilium o el catálogo, con filtros', () => {
  const rubros = rankItems(items, { months: 1, now: NOW, catalog, level: 'rubro' });
  assert.deepEqual(rubros.rows.map((row) => row.label), ['Poliuretano', 'Resinplast']);
  assert.deepEqual(rubros.options.rubros, ['Poliuretano', 'Resinplast']);
  const only = rankItems(items, { months: 1, now: NOW, catalog, company: 'POLIPLAST', level: 'subrubro' });
  assert.deepEqual(only.rows.map((row) => [row.label, row.net]), [['Isocianatos', 1000], ['Epoxi', 300]]);
  const filtered = rankItems(items, { months: 1, now: NOW, catalog, rubro: 'Resinplast' });
  assert.deepEqual(filtered.rows.map((row) => row.sku), ['RE-608-750']);
  assert.equal(classify({ nombre: 'algo' }).rubro, 'Sin rubro');
});

test('búsqueda, barras y CSV', () => {
  const result = rankItems(items, { months: 1, now: NOW, catalog, query: 'resina' });
  assert.equal(result.rows.length, 1);
  assert.deepEqual(barWidths([{ net: 200 }, { net: 50 }, { net: -10 }]), [100, 25, 0]);
  assert.match(rankingCsv(result.rows), /"1";"RE-608-750";"Resina 750"/);
  assert.equal(sinceDate(1, NOW) < '2026-10-29', true);
});

test('renglones del detalle de Contabilium con nombres de campos tolerantes', () => {
  const rows = itemRows({ company: 'POLIPLAST', id: '55', tipo: 'NCA', fecha: '2026-11-20' }, {
    Items: [
      { Codigo: ' re-608-750 ', Concepto: 'Resina', Cantidad: 3, PrecioUnitario: 100, Bonificacion: 10 },
      { Concepto: { Nombre: 'Flete', Codigo: 'FLETE' }, Cantidad: '1', Importe: '50,5' },
    ],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].codigo, rows[0].neto, rows[0].signo, rows[0].linea], ['RE-608-750', 270, -1, 1]);
  assert.deepEqual([rows[1].codigo, rows[1].nombre, rows[1].neto], ['FLETE', 'Flete', 50.5]);
  assert.deepEqual(itemRows({ company: 'X', id: 1, tipo: 'FCA' }, {}), []);
});
