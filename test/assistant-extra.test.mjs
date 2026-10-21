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
