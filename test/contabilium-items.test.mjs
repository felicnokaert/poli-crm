import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyRates, itemRows, rateFor, saleSign } from '../lib/contabilium-items.mjs';

test('renglones: signo por tipo y USD con el dólar del día', () => {
  assert.equal(saleSign('FCA'), 1);
  assert.equal(saleSign('NCT'), -1);
  assert.equal(saleSign('NDA'), 0);
  const rates = dailyRates([{ fecha: '2026-11-20', tc: '1500' }]);
  assert.equal(rateFor({ fecha: '2026-11-21', tc: '1' }, rates), 1500);
  const [ars] = itemRows({ company: 'POLIPLAST', id: '1', tipo: 'FCA', fecha: '2026-11-20', moneda: '12661', tcDay: 1500 }, { Items: [{ Codigo: ' a-1 ', Cantidad: 2, ImporteNeto: 300000 }] });
  assert.equal(ars.codigo, 'A-1');
  assert.equal(ars.neto_usd, 200);
  const [usd] = itemRows({ company: 'POLIOCHO', id: '2', tipo: 'COT', fecha: '2026-11-20', moneda: '57213', tcDay: 1500 }, { Items: [{ Codigo: 'B', Cantidad: 1, ImporteNeto: 90 }] });
  assert.equal(usd.moneda, 'USD');
  assert.equal(usd.neto_usd, 90);
});

import { mlComprobanteRow, comprobanteRow } from '../lib/contabilium.mjs';

test('facturas de Mercado Libre: aparte y sin datos del comprador', () => {
  const item = { Id: 9, TipoFc: 'FCB', Numero: '0005-1', FechaEmision: '2026-11-20T00:00:00', Origen: 'MercadoLibre', IDMoneda: 12661, TipoDeCambio: '1500', Total: 30000, RazonSocial: 'Juan Pérez', IdCliente: 77 };
  assert.equal(comprobanteRow(item, 'POLIPLAST'), null);
  const row = mlComprobanteRow(item, 'POLIPLAST');
  assert.equal(row.id, '9');
  assert.equal(row.fecha, '2026-11-20');
  assert.equal(row.moneda, '12661');
  assert.ok(!('cliente' in row) && !('raw' in row));
  assert.equal(mlComprobanteRow({ ...item, Origen: '' }, 'POLIPLAST'), null);
  const [line] = itemRows({ company: 'POLIPLAST', id: '9', tipo: 'FCB', fecha: '2026-11-20', moneda: '12661', tcDay: 1500, canal: 'ml' }, { Items: [{ Codigo: 'A', Cantidad: 1, ImporteNeto: 15000 }] });
  assert.equal(line.canal, 'ml');
  assert.equal(line.neto_usd, 10);
});
