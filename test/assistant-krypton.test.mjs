import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kryptonAdvice, kryptonContext, kryptonFor, parseKryptonAsk } from '../src/assistant-krypton.mjs';

test('200 m² con top: coincide con la planilla (3, 14 y 7 kits)', () => {
  const quote = kryptonFor('Quiero cotizar 200 m2 de un kit con top de poliurea');
  assert.deepEqual(quote.rows.map((row) => [row.key, row.kgToUse, row.kits, row.closedKg, row.leftoverKg]), [
    ['imprimacion', 40, 3, 45, 5],
    ['poliurea', 352, 14, 371, 19],
    ['top', 140, 7, 157.5, 17.5],
  ]);
  assert.equal(quote.totalKgToUse, 532);
  assert.equal(quote.totalClosedKg, 573.5);
  assert.equal(quote.coversM2, 210);
  assert.ok(quote.explicit);
});

test('variantes: sin top, solo imprimante, solo poliurea, solo top', () => {
  assert.equal(parseKryptonAsk('cotizar 200 m2 kit sin top').system, 'sin_top');
  assert.deepEqual(kryptonFor('cotizar 200 m2 poliurea sin top').rows.map((row) => row.key), ['imprimacion', 'poliurea']);
  assert.deepEqual(kryptonFor('necesito solo imprimante para 80 m2').rows.map((row) => [row.key, row.kgToUse, row.kits]), [['imprimacion', 16, 2]]);
  assert.deepEqual(kryptonFor('cuantos kilos de poliurea para 120 metros cuadrados, solo poliurea').rows.map((row) => [row.key, row.kgToUse, row.kits]), [['poliurea', 211.2, 8]]);
  assert.equal(parseKryptonAsk('presupuesto 50 m2 solo el top impermax').system, 'top');
});

test('sin aclarar si lleva top se calcula con top y se avisa', () => {
  const quote = kryptonFor('quiero cotizar 100 m2 de poliurea');
  assert.equal(quote.system, 'con_top');
  assert.equal(quote.explicit, false);
  assert.match(kryptonContext(quote), /no aclaró/);
});

test('hasta 15 m² usa los kits chicos de 5, 10 y 15 m²', () => {
  const quote = kryptonFor('kit de poliurea para 10 m2');
  assert.ok(quote.small);
  assert.deepEqual(quote.rows.map((row) => row.closedKg), [2, 17.6, 7]);
  assert.match(kryptonAdvice(quote)[0], /kit de 10 m²/);
  assert.equal(kryptonFor('cotizar 12 m2 de poliurea').smallM2, 15);
});

test('no se confunde con otras preguntas', () => {
  assert.equal(kryptonFor('cuanto rinde la poliurea'), null);
  assert.equal(kryptonFor('cotizar 200 m2 de piso de goma'), null);
  assert.equal(kryptonFor('precio de la imprimacion'), null);
});

test('un número redondo no pide un kit de más por redondeo de coma flotante', () => {
  const quote = kryptonFor('cotizar 75 m2 solo imprimante');
  assert.equal(quote.rows[0].kits, 1); // 75 × 0,2 = 15 kg justos
});
