import test from 'node:test';
import assert from 'node:assert/strict';
import { stockLabel, stockMap } from '../src/quote-stock.mjs';

test('stock del cotizador nativo: suma por código entre empresas', () => {
  const { map, at } = stockMap({ companies: { A: { at: '2026-11-28T10:00', items: { 'kt-618 20': { d: { vd: 2, mdq: 1 } } } }, B: { at: '2026-11-28T11:00', items: { 'KT-61820': { d: { vd: 3 } } } } } });
  assert.deepEqual(map.get('KT-61820'), { vd: 5, mdq: 1 });
  assert.equal(at, '2026-11-28T11:00');
  assert.equal(stockLabel(map.get('KT-61820')).text, 'Stock: 5 VD · 1 MDQ');
  assert.equal(stockLabel({ vd: 0, mdq: -2 }).text, 'Sin stock');
  assert.equal(stockLabel(null), null);
});
