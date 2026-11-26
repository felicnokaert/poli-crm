import test from 'node:test';
import assert from 'node:assert/strict';
import { diffTiers, validateMinimum, validatePayment, validateTiers } from '../src/price-admin.mjs';

test('Tramos: ordena, valida superposición y precios', () => {
  assert.match(validateTiers([{ from: 1, amount: 0 }]).error, /mayor a 0/);
  assert.match(validateTiers([{ from: 1, to: null, amount: 10 }, { from: 10, amount: 9 }]).error, /se pisa/);
  assert.match(validateTiers([{ from: 1, to: 9, amount: 10 }, { from: 1, amount: 9 }]).error, /dos tramos/);
  const { tiers } = validateTiers([{ from: '10', amount: '9,5' }, { from: '1', to: '9', amount: '10' }]);
  assert.deepEqual(tiers.map((tier) => [tier.from, tier.to, tier.amount]), [[1, 9, 10], [10, null, 9.5]]);
});

test('Tramos: diff actualiza el mismo «desde», inserta nuevos y borra los quitados', () => {
  const stored = [{ id: 'a', min_quantity: 1, max_quantity: 9, amount: 10 }, { id: 'b', min_quantity: 10, max_quantity: null, amount: 9 }, { id: 'c', min_quantity: 50, max_quantity: null, amount: 8 }];
  const { tiers } = validateTiers([{ from: 1, to: 9, amount: 10 }, { from: 10, to: 49, amount: 8.5 }, { from: 100, amount: 7 }]);
  const diff = diffTiers(stored, tiers, { who: 'felipe@', today: '2026-11-26' });
  assert.deepEqual(diff.insert, [{ min_quantity: 100, max_quantity: null, amount: 7 }]);
  assert.equal(diff.update.length, 1);
  assert.equal(diff.update[0].id, 'b');
  assert.match(diff.update[0].override_reason, /antes 9/);
  assert.deepEqual(diff.remove, ['c']);
  assert.equal(diffTiers(stored.slice(0, 1), validateTiers([{ from: 1, to: 9, amount: 10 }]).tiers).changed, false);
});

test('Formas de pago y mínimos mayoristas', () => {
  assert.match(validatePayment({ name: 'X', discount_percent: 5, surcharge_percent: 5 }).error, /no los dos/);
  assert.equal(validatePayment({ name: 'Transferencia', discount_percent: '5' }).payment.discount_percent, 5);
  assert.match(validateMinimum({ brand: 'Penosil', threshold_net_usd: 0 }).error, /mayor a 0/);
  assert.equal(validateMinimum({ brand: 'Penosil', threshold_net_usd: '1800' }).minimum.threshold_net_usd, 1800);
});

test('Cambio por lote: +8 % redondeado, anota el precio anterior y frena porcentajes absurdos', async () => {
  const { bulkChange } = await import('../src/price-admin.mjs');
  const { rows } = bulkChange([{ id: 'a', amount: 10 }, { id: 'b', amount: 0 }, { id: 'c', amount: 3.33 }], 8, { who: 'felipe@', today: '2026-11-26' });
  assert.deepEqual(rows.map((row) => [row.id, row.amount]), [['a', 10.8], ['c', 3.6]]);
  assert.match(rows[0].override_reason, /Lote \+8 % .*antes 10/);
  assert.match(bulkChange([{ amount: 1 }], 0).error, /distinto de 0/);
  assert.match(bulkChange([{ amount: 1 }], 150).error, /-50 % y \+100 %/);
});
