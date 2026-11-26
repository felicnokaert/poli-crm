import test from 'node:test';
import assert from 'node:assert/strict';
import { countUse, pinToggle, quickAccessIds } from '../src/quick-access.mjs';

test('Acceso rápido: fijadas primero, después las más usadas, solo las permitidas', () => {
  let value = { uses: {}, pins: [] };
  for (let i = 0; i < 5; i += 1) value = countUse(value, 'sales');
  for (let i = 0; i < 3; i += 1) value = countUse(value, 'quoter');
  value = countUse(value, 'map');
  value = pinToggle(value, 'entregas');
  assert.deepEqual(quickAccessIds(value, ['sales', 'quoter', 'map', 'entregas', 'dashboard']), ['entregas', 'sales', 'quoter']);
  assert.deepEqual(quickAccessIds(value, ['quoter']), ['quoter']);
  assert.deepEqual(pinToggle(value, 'entregas').pins, []);
});
