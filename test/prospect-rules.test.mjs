import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, changedRules, isDefault, normalizeRules } from '../src/prospect-rules.mjs';
import { buildQueue, prospectScore, sheetBonus } from '../src/prospect-queue.mjs';
import { radiusForPopulation } from '../src/prospect-radius.mjs';

test('sin cambios, las reglas son las de siempre', () => {
  assert.equal(isDefault({}), true);
  assert.deepEqual(normalizeRules(undefined), DEFAULT_RULES);
  assert.deepEqual(changedRules({}), {});
  assert.equal(radiusForPopulation(600000), 10);
  assert.equal(radiusForPopulation(150000), 9);
  assert.equal(radiusForPopulation(40000), 7);
  assert.equal(radiusForPopulation(5000), 5);
  assert.equal(sheetBonus({ sheetScore: 90, fitLevel: 'Alto', zone: 'A' }), 4 + 3 + 2);
});

test('valores inválidos se corrigen y solo se guardan las diferencias', () => {
  const rules = normalizeRules({ phone: '7', email: 'abc', zoneA: 99, radiusSmall: 0, populationBig: '1000000' });
  assert.equal(rules.phone, 7);
  assert.equal(rules.email, DEFAULT_RULES.email);
  assert.equal(rules.zoneA, 10); // tope
  assert.equal(rules.radiusSmall, 1); // mínimo
  assert.deepEqual(changedRules({ phone: 7, email: 2 }), { phone: 7 });
  assert.equal(isDefault({ phone: 7 }), false);
});

test('las reglas cambian el orden de la cola y el radio', () => {
  const a = { id: 'a', state: 'No contactado', phone: '+5491112345678', createdAt: '1' };
  const b = { id: 'b', state: 'No contactado', email: 'x@y.com', website: 'https://y.com', createdAt: '2' };
  assert.deepEqual(buildQueue([a, b]), ['a', 'b']); // teléfono 3+1 contra mail 2 + web 2 (empatan en 4: gana el más viejo)
  const web = normalizeRules({ website: 8 });
  assert.deepEqual(buildQueue([a, b], new Map(), { rules: web }), ['b', 'a']);
  assert.ok(prospectScore(b, { status: 'Nuevo' }, web) > prospectScore(b));
  const radius = normalizeRules({ radiusBig: 20, populationBig: 300000 });
  assert.equal(radiusForPopulation(400000, radius), 20);
  assert.equal(radiusForPopulation(400000), 9);
});
