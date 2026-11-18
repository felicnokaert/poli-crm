import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionFloorMonths, floorApplies, normalizeCommissionFloor, saleCommissionWithFloor } from '../src/sales-model.mjs';

const units = {
  Poliplast: { rate: 0.03, invoicePoints: ['0006'], pointRates: {} },
  Poliocho: { rate: 0.03, invoicePoints: ['0003', '0008'], pointRates: { '0003': 0.01 } },
};
const sale = (over) => ({ id: 'x', date: '2026-11-10', unit: 'Poliplast', pointOfSale: '0006', netAmount: 1000, currency: 'USD', exchangeRate: 1000, ...over });
const floor = { enabled: true, amount: 5000, currency: 'USD', units: [], exempt: [{ unit: 'Poliocho', point: '0003' }] };

test('bajo el piso no se cobra; al llegar, se cobra toda la comisión del mes', () => {
  const low = [sale({ netAmount: 2000 }), sale({ id: 'y', netAmount: 2000 })];
  const monthsLow = commissionFloorMonths(low, floor);
  assert.equal(monthsLow['2026-11'].reached, false);
  assert.equal(monthsLow['2026-11'].missing, 1000);
  assert.equal(saleCommissionWithFloor(low[0], units, floor, monthsLow), 0);
  const ok = [...low, sale({ id: 'z', netAmount: 1000 })];
  const monthsOk = commissionFloorMonths(ok, floor);
  assert.equal(monthsOk['2026-11'].reached, true);
  assert.equal(saleCommissionWithFloor(ok[0], units, floor, monthsOk), 2000 * 1000 * 0.03);
});

test('Poliocho 0003 no cuenta para el piso y cobra siempre; Poliocho 0008 sí cuenta', () => {
  const p0003 = sale({ unit: 'Poliocho', pointOfSale: '0003', netAmount: 10000 });
  const p0008 = sale({ id: 'b', unit: 'Poliocho', pointOfSale: '0008', netAmount: 1000 });
  assert.equal(floorApplies(p0003, floor), false);
  assert.equal(floorApplies(p0008, floor), true);
  const months = commissionFloorMonths([p0003, p0008], floor);
  assert.equal(months['2026-11'].total, 1000, 'el 0003 no suma al piso');
  assert.equal(saleCommissionWithFloor(p0003, units, floor, months), 10000 * 1000 * 0.01);
  assert.equal(saleCommissionWithFloor(p0008, units, floor, months), 0);
});

test('sin piso o con unidades acotadas todo sigue igual', () => {
  const s = sale();
  assert.equal(saleCommissionWithFloor(s, units, { enabled: false, amount: 5000 }, {}), 1000 * 1000 * 0.03);
  const only = { ...floor, units: ['Poliocho'] };
  assert.equal(floorApplies(s, only), false);
  assert.equal(normalizeCommissionFloor({ enabled: true, amount: 0 }).enabled, false);
});

test('el piso en pesos usa el neto en pesos; los meses se separan', () => {
  const f = { enabled: true, amount: 3000000, currency: 'ARS', units: [], exempt: [] };
  const sales = [sale({ currency: 'ARS', netAmount: 3000000 }), sale({ id: 'n', date: '2026-12-02', currency: 'ARS', netAmount: 100 })];
  const months = commissionFloorMonths(sales, f);
  assert.equal(months['2026-11'].reached, true);
  assert.equal(months['2026-12'].reached, false);
});
