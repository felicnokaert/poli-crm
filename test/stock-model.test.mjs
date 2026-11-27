import test from 'node:test';
import assert from 'node:assert/strict';
import { daysSince, dosifiedSince, latestCounts, searchStock, stamp, stockNow } from '../src/stock-model.mjs';

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

test('Stock: resta lo dosificado después del conteo en el mismo depósito', () => {
  const counts = latestCounts(logs);
  const moves = dosifiedSince(
    [{ id: 'p1', fecha: '2026-11-21', hora: '10:00:00', deposito: 'Mar del Plata' }, { id: 'p0', fecha: '2026-11-19', hora: '10:00', deposito: 'Mar del Plata' }],
    [{ planilla_id: 'p1', sku: 'KT-618-10', cantidad: 3, componentes: [{ sku: 'SP-618', kg: 5 }, { sku: 'ISO', kg: 5 }] }, { planilla_id: 'p0', sku: 'KT-618-10', cantidad: 9, componentes: [{ sku: 'SP-618', kg: 5 }] }],
  );
  const now = stockNow(counts, moves);
  const sp = now.find((row) => row.sku === 'SP-618');
  assert.equal(sp.usedKg, 15);
  assert.equal(sp.kgNow, 425);
  assert.equal(sp.status, 'hay');
  assert.equal(now.find((row) => row.sku === 'BAL-10').status, 'sin');
});

test('Stock: búsqueda sin acentos y antigüedad del conteo', () => {
  const rows = latestCounts(logs);
  assert.deepEqual(searchStock(rows, 'pasta').map((row) => row.sku), ['PG-NEGRO']);
  assert.equal(daysSince('2026-11-20T09:13', Date.parse('2026-11-26T12:00:00-03:00')), 6);
});
