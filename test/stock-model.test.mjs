import test from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, dosifiedSince, latestCounts, searchStock, stamp, stockNow } from '../src/stock-model.mjs';
import { depotLabel, isOldDepot } from '../src/stock-model.mjs';

const logs = [
  { key: 'log:mardel:Braian:2026-11-13', value: [{ sku: 'SP-618', nombre: '618 SP', cant: 4, cap: 220, unidad: 'Tambor', depId: 'mardel', depNombre: 'Mar del Plata', fecha: '13/11/2026', hora: '12:50', contador: 'Braian', catNombre: 'Espumas' }] },
  { key: 'log:mardel:Braian:2026-11-20', value: [
    { sku: 'SP-618', nombre: '618 SP', cant: 2, cap: 220, unidad: 'Tambor', depId: 'mardel', depNombre: 'Mar del Plata', fecha: '20/11/2026', hora: '09:13', contador: 'Braian' },
    { sku: 'PG-NEGRO', nombre: 'Pasta negra', cant: 25, cap: '', unidad: 'Kilo', depId: 'mardel', depNombre: 'Mar del Plata', fecha: '20/11/2026', hora: '09:20', contador: 'Braian' },
    { sku: 'BAL-10', nombre: 'Balde 10 L', cant: 0, cap: 1, unidad: 'Unidad', depId: 'mardel', depNombre: 'Mar del Plata', fecha: '20/11/2026', hora: '09:30', contador: 'Braian' },
  ] },
];

test('Stock: último conteo por depósito y SKU, en kilos cuando se puede', () => {
  assert.equal(stamp('3/9/2026', '8:08'), '2026-09-03T08:08');
  const counts = latestCounts(logs);
  const sp = counts.find((row) => row.sku === 'SP-618');
  assert.equal(sp.count, 2);
  assert.equal(sp.kg, 440);
  assert.equal(counts.find((row) => row.sku === 'PG-NEGRO').kg, 25);
});

test('Stock: lo dosificado NO se resta (tambor abierto, Diego 27/11), queda como dato; con la opción sí se resta', () => {
  const counts = latestCounts(logs);
  const moves = dosifiedSince(
    [{ id: 'p1', fecha: '2026-11-21', hora: '10:00:00', deposito: 'Mar del Plata' }, { id: 'p0', fecha: '2026-11-19', hora: '10:00', deposito: 'Mar del Plata' }],
    [{ planilla_id: 'p1', sku: 'KT-618-10', cantidad: 3, componentes: [{ sku: 'SP-618', kg: 5 }, { sku: 'ISO', kg: 5 }] }, { planilla_id: 'p0', sku: 'KT-618-10', cantidad: 9, componentes: [{ sku: 'SP-618', kg: 5 }] }],
  );
  const now = stockNow(counts, moves);
  const sp = now.find((row) => row.sku === 'SP-618');
  assert.equal(sp.usedKg, 15);
  assert.equal(sp.kgNow, 440);
  assert.equal(sp.status, 'hay');
  assert.equal(stockNow(counts, moves, { subtractDosified: true }).find((row) => row.sku === 'SP-618').kgNow, 425);
  assert.equal(now.find((row) => row.sku === 'BAL-10').status, 'sin');
});

test('Stock: búsqueda sin acentos y antigüedad del conteo', () => {
  const rows = latestCounts(logs);
  assert.deepEqual(searchStock(rows, 'pasta').map((row) => row.sku), ['PG-NEGRO']);
  assert.equal(daysSince('2026-11-20T09:13', Date.parse('2026-11-26T12:00:00-03:00')), 6);
});

test('Berazategui es el depósito viejo', () => {
  assert.equal(isOldDepot('Berazategui'), true);
  assert.equal(isOldDepot('Villa Dominico'), false);
  assert.equal(depotLabel('Berazategui'), 'Berazategui (depósito viejo)');
});

import { contabiliumByCode, countInfo, depotSlot, pivotStock } from '../src/stock-model.mjs';
import { stockFromConcept, depotKey } from '../lib/contabilium.mjs';

const cell = (over) => ({ sku: 'IF-1517', name: '1517 ISO', category: 'Isocianatos', unit: 'tambor', count: 1, kg: 250, kgNow: 250, status: 'hay', usedKg: 0, by: 'Marcos', at: '2026-11-20T09:00', ...over });

test('una fila por producto con V. Domínico y MDQ; Berazategui aparte', () => {
  const rows = [
    cell({ depot: 'Mar del Plata', by: 'Braian', at: '2026-10-22T10:00' }),
    cell({ depot: 'Villa Dominico', at: '2026-11-25T09:00', count: 2, kg: 500, kgNow: 500 }),
    cell({ depot: 'Berazategui', at: '2026-09-17T09:00', count: 0, kg: 0, kgNow: 0, status: 'sin' }),
  ];
  const [product] = pivotStock(rows, new Map([['IF-1517', { vd: 3, mdq: null, total: 3 }]]));
  assert.equal(product.vd.kgNow, 500);
  assert.equal(product.mdq.by, 'Braian');
  assert.equal(product.old.depot, 'Berazategui');
  assert.equal(product.cbVd, 3);
  assert.equal(product.cbMdq, null);
  assert.equal(product.status, 'hay');
});

test('en cada depósito queda el ÚLTIMO conteo y la «i» dice quién y cuándo', () => {
  const rows = [cell({ depot: 'Villa Dominico', by: 'Marcos', at: '2026-11-01T08:00' }), cell({ depot: 'Villa Dominico', by: 'Neyen', at: '2026-11-26T15:30' })];
  const [product] = pivotStock(rows);
  assert.equal(product.vd.by, 'Neyen');
  const text = countInfo(product.vd, Date.parse('2026-11-27T12:00:00-03:00'));
  assert.match(text, /Neyen, el 26\/11\/2026 a las 15:30 \(hace 0 días\)|Neyen, el 26\/11\/2026 a las 15:30 \(hace 1 día\)/);
  assert.equal(countInfo(null), 'Sin conteo en este depósito.');
});

test('depósitos por nombre', () => {
  assert.equal(depotSlot('Villa Domínico'), 'vd');
  assert.equal(depotSlot('MDQ'), 'mdq');
  assert.equal(depotSlot('Berazategui'), 'old');
  assert.equal(depotKey('Depósito Mar del Plata'), 'mdq');
});

test('Contabilium: concepto con stock por depósito, tolerante con los nombres', () => {
  const row = stockFromConcept({ Codigo: 'if-1517 ', Nombre: 'ISO', Stock: '5', Depositos: [{ Deposito: { Nombre: 'Villa Dominico' }, Stock: 3 }, { NombreDeposito: 'Mar del Plata', Cantidad: '2' }] });
  assert.deepEqual(row, { code: 'IF-1517', name: 'ISO', total: 5, depots: { vd: 3, mdq: 2 } });
  assert.equal(stockFromConcept({ Nombre: 'sin código' }), null);
  const map = contabiliumByCode({ companies: { POLIPLAST: { items: { 'IF-1517': { n: 'ISO', t: 5, d: { vd: 3 } } } } } });
  assert.deepEqual(map.get('IF-1517'), { vd: 3, mdq: null, total: 5 });
});

import { adjustList, adjustCsv, countedUnits } from '../src/stock-model.mjs';

test('para ajustar: pasa lo contado a la unidad de Contabilium y separa diferencias y negativos', () => {
  const products = [
    { sku: 'IF-1517', name: 'ISO', mdq: { count: 2, cap: 220, unit: 'Tambor', at: '2026-11-27T10:00', by: 'Braian' }, cbMdq: 460, cbVd: 0, vd: null },
    { sku: 'BL-10', name: 'Balde', vd: { count: 10, cap: 12, unit: 'Caja' }, cbVd: 100 },
    { sku: 'PM1', name: 'O-ring', vd: { count: 5, unit: 'Unidad' }, cbVd: 5, mdq: null, cbMdq: -3 },
  ];
  assert.equal(countedUnits(products[0].mdq), 440);
  const { rows, checked, matching, pct } = adjustList(products);
  assert.equal(checked, 3);
  assert.equal(matching, 1);
  assert.equal(pct, 33);
  assert.deepEqual(rows.map((row) => [row.sku, row.depot, row.diff]), [['IF-1517', 'Mar del Plata', -20], ['BL-10', 'Villa Domínico', 20], ['PM1', 'Mar del Plata', null]]);
  assert.match(adjustCsv(rows), /IF-1517/);
});
