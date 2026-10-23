import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competitionCsv, competitionRows } from '../src/ml-competition-view.mjs';

const item = (over = {}) => ({ id: 'MLA1', title: 'Espuma "PU" 1kg', price: 90, sold_quantity: 130, seller_nickname: 'BAROVO', status: 'active', free_shipping: true, permalink: 'https://ml/MLA1', ...over });
const snaps = (price, sold) => [
  { item_id: 'MLA1', taken_on: '2026-10-22', price, sold_quantity: sold },
  { item_id: 'MLA1', taken_on: '2026-10-23', price: 90, sold_quantity: 130 },
];

test('avisa si el precio bajó más de 5 % o vendió más de 10 unidades en 24 horas', () => {
  const [row] = competitionRows({ competitors: [item()], snapshots: snaps(100, 110), ours: [], today: '2026-10-23' });
  assert.equal(row.priceChange1, -10);
  assert.equal(row.sold1, 20);
  assert.deepEqual(row.alerts.map((alert) => alert.kind), ['precio', 'ventas']);
});

test('sin cambios fuertes no hay alertas, y el primer día no hay diferencias', () => {
  const [calm] = competitionRows({ competitors: [item({ price: 98 })], snapshots: snaps(100, 125), ours: [], today: '2026-10-23' });
  assert.deepEqual(calm.alerts, []);
  const [first] = competitionRows({ competitors: [item()], snapshots: [{ item_id: 'MLA1', taken_on: '2026-10-23', price: 90, sold_quantity: 130 }], ours: [], today: '2026-10-23' });
  assert.equal(first.priceChange1, null);
  assert.equal(first.sold1, null);
});

test('el CSV trae encabezados, escapa comillas y marca las alertas', () => {
  const rows = competitionRows({ competitors: [item()], snapshots: snaps(100, 110), ours: [], today: '2026-10-23' });
  const csv = competitionCsv(rows);
  assert.ok(csv.startsWith('﻿"Vendedor"'));
  assert.match(csv, /"Espuma ""PU"" 1kg"/);
  assert.match(csv, /Bajó el precio 10 % en 24 h \| Vendió 20 en 24 h/);
});
