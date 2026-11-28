import test from 'node:test';
import assert from 'node:assert/strict';
import { agingMatches, balancesByClient, currencyOf, kindOf, money, signed } from '../src/billing-view.mjs';
import { coverageState, runningOut } from '../src/purchasing.mjs';

test('facturación: tipos, moneda y saldos por cliente', () => {
  assert.equal(kindOf('FCA'), 'facturas');
  assert.equal(kindOf('NCB'), 'creditos');
  assert.equal(kindOf('NDA'), 'debitos');
  assert.equal(kindOf('COT'), 'cotizaciones');
  assert.equal(currencyOf('12756'), 'USD');
  assert.equal(currencyOf(null), 'ARS');
  assert.equal(money(1234.5, 'USD'), 'USD 1.234,50');
  assert.equal(signed({ tipo: 'NCA', total: 100 }), -100);
  const today = new Date('2026-11-28T12:00:00');
  const rows = [
    { company: 'POLIPLAST', cliente_id: '1', cliente: 'Thorne', tipo: 'FCA', fecha: '2026-10-01', saldo: 1000 },
    { company: 'POLIPLAST', cliente_id: '1', cliente: 'Thorne', tipo: 'FCA', fecha: '2026-11-20', saldo: 500 },
    { company: 'POLIPLAST', cliente_id: '1', cliente: 'Thorne', tipo: 'NCA', fecha: '2026-11-21', saldo: 300 },
    { company: 'POLIPLAST', cliente_id: '2', cliente: 'Otro', tipo: 'FCA', fecha: '2026-11-21', saldo: 0 },
  ];
  const groups = balancesByClient(rows, today);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].saldo, 1500);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].days, 58);
  assert.equal(agingMatches(58, '90'), true);
  assert.equal(agingMatches(58, '30'), false);
});

test('compras: cobertura en días y sugerido para 60 días', () => {
  const stock = new Map([['A-1', { vd: 10, mdq: 0 }], ['B-2', { vd: 0, mdq: 0 }], ['C-3', { vd: 100, mdq: 50 }]]);
  const sales = [
    { codigo: 'a-1', unidades_6m: 182, nombre: 'A' },
    { codigo: 'B-2', unidades_6m: 91, nombre: 'B' },
    { codigo: 'C-3', unidades_6m: 18.2, nombre: 'C' },
    { codigo: 'D-4', unidades_6m: 50 }, // sin stock leído: no entra
    { codigo: 'C-3x', unidades_6m: 0 },
  ];
  const rows = runningOut(sales, stock);
  assert.deepEqual(rows.map((row) => row.code), ['B-2', 'a-1', 'C-3']);
  assert.equal(rows[0].state, 'sin-stock');
  assert.equal(rows[1].days, 10);
  assert.equal(rows[1].state, 'critico');
  assert.equal(rows[1].suggest, 50);
  assert.equal(rows[2].state, 'ok');
  assert.equal(coverageState(20), 'bajo');
});
