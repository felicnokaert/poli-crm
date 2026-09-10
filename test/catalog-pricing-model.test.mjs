import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendPriceRevision,
  buildEditablePrice,
  commercialRates,
  priceFromMargin,
  priceFromMarkup,
  validateEditablePrice,
} from '../src/catalog-pricing-model.mjs';

test('calcula precio por markup sin confundirlo con margen', () => {
  assert.equal(priceFromMarkup(100, 0.5), 150);
  assert.equal(priceFromMargin(100, 0.5), 200);
});

test('calcula markup y margen efectivos desde costo y precio', () => {
  assert.deepEqual(commercialRates(100, 150), { markupRate: 0.5, marginRate: 1 / 3 });
});

test('un mayorista pendiente conserva el valor vacio', () => {
  const price = buildEditablePrice({ cost: 100, costCurrency: 'USD', status: 'pendiente' });
  assert.equal(price.price, null);
  assert.equal(validateEditablePrice(price).valid, true);
});

test('un precio confirmado exige valor y fuente', () => {
  const price = buildEditablePrice({ costCurrency: 'USD', status: 'confirmado' });
  assert.deepEqual(validateEditablePrice(price).errors, [
    'precio_confirmado_sin_valor',
    'precio_confirmado_sin_fuente',
  ]);
});

test('permite editar costo y margen y recalcula el precio', () => {
  const price = buildEditablePrice({
    cost: '80,5', costCurrency: 'usd', calculationMode: 'margin', marginRate: 0.35,
    status: 'confirmado', source: 'Lista aprobada',
  });
  assert.equal(price.cost, 80.5);
  assert.equal(price.price, 80.5 / 0.65);
  assert.equal(validateEditablePrice(price).valid, true);
});

test('una excepcion manual exige motivo y queda en historial', () => {
  const current = buildEditablePrice({ cost: 100, costCurrency: 'USD', markupRate: 0.5 });
  const next = buildEditablePrice({ cost: 100, costCurrency: 'USD', price: 120, status: 'excepcion_manual' });
  assert.deepEqual(validateEditablePrice(next).errors, ['excepcion_sin_motivo']);
  const history = appendPriceRevision([], current, { ...next, overrideReason: 'Acuerdo por volumen' }, 'Felipe', '2026-09-10T18:00:00Z');
  assert.equal(history[0].actor, 'Felipe');
  assert.equal(history[0].next.price, 120);
});
