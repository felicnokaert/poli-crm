import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraContext, purchaseLine, purchaseNameWords, purchaseSummary, rivalsFor } from '../src/assistant-extra.mjs';

const competitors = [
  { id: 1, name: 'Kilcom', families: ['Poliuretano'], summary: 'Sistemas PU' },
  { id: 2, name: 'Graco', families: ['PURMAC'], summary: 'Máquinas' },
  { id: 3, name: 'Cliente X', kind: 'cliente', families: ['Poliuretano'] },
];

test('competidores: por familia y con las palabras de la gente', () => {
  assert.equal(rivalsFor(competitors, 'rendimiento epoxi'), null);
  assert.deepEqual(rivalsFor(competitors, 'competidores de espuma').list.map((rival) => rival.name), ['Kilcom']);
  assert.deepEqual(rivalsFor(competitors, '¿Quién es la competencia en máquinas?').list.map((rival) => rival.name), ['Graco']);
  assert.equal(rivalsFor(competitors, 'competencia').list.length, 2);
});

test('cuándo compró un cliente: nombre, última factura, 24 meses y cotización', () => {
  assert.deepEqual(purchaseNameWords('¿Cuándo compró Lavopa?'), ['lavopa']);
  assert.deepEqual(purchaseNameWords('rinde la epoxi'), []);
  const rows = [
    { company: 'POLIPLAST', tipo: 'FCA', numero: '1', fecha: '2026-09-01', cliente: 'LAVOPA ROLANDO', total: 1000, saldo: 0 },
    { company: 'POLIPLAST', tipo: 'COT', numero: '2', fecha: '2026-10-01', cliente: 'LAVOPA ROLANDO', total: 500 },
    { company: 'POLIPLAST', tipo: 'FCA', numero: '3', fecha: '2023-01-01', cliente: 'LAVOPA ROLANDO', total: 9000, saldo: 200 },
  ];
  const [summary] = purchaseSummary(rows, { today: '2026-10-21' });
  assert.equal(summary.last.numero, '1');
  assert.equal(summary.purchases24, 1);
  assert.equal(summary.billed24, 1000);
  const line = purchaseLine(summary, { today: '2026-10-21' });
  assert.match(line, /Última compra: 01\/09\/2026 \(hace 50 días/);
  assert.match(line, /última cotización 01\/10\/2026/);
  assert.match(line, /saldo pendiente \$ 200/);
  assert.match(extraContext({ purchases: [summary], today: '2026-10-21' }), /LAVOPA ROLANDO \(POLIPLAST\)/);
});

test('perfil de compra: cada cuántos días compra y si ya le toca', () => {
  const rows = ['2026-01-10', '2026-03-10', '2026-05-10', '2026-07-10'].map((fecha, index) => ({ company: 'POLIPLAST', tipo: 'FCA', fecha, cliente: 'ACME', total: 1000, id: String(index) }));
  rows.push({ company: 'POLIPLAST', tipo: 'FCA', fecha: '2025-03-01', cliente: 'ACME', total: 500, id: 'x' });
  const [summary] = purchaseSummary(rows, { today: '2026-10-21' });
  assert.ok(summary.everyDays >= 59 && summary.everyDays <= 62);
  const line = purchaseLine(summary, { today: '2026-10-21' });
  assert.match(line, /suele comprar cada ~\d+ días \(ya pasaron \d+ días de cuando solía volver/);
  assert.match(line, /\+\d+ % contra los 12 anteriores/);
});
