import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJsxModule } from './helpers/load-jsx.mjs';
const { DEFAULT_OPERATORS, operatorsFrom } = await loadJsxModule('src/ExpeditionGate.jsx');

test('la lista de operarios sale de Entregas, sin Felipe, Braian en Mar del Plata', () => {
  const list = operatorsFrom(['Marcos', 'Braian', 'Felipe', ' ', 'Juan']);
  assert.deepEqual(list, [['Marcos', 'Villa Domínico'], ['Braian', 'Mar del Plata'], ['Juan', 'Villa Domínico']]);
});

test('sin datos queda la lista de respaldo con los nombres de Entregas', () => {
  assert.equal(operatorsFrom(null), DEFAULT_OPERATORS);
  assert.ok(DEFAULT_OPERATORS.some(([name]) => name === 'Juan'));
  assert.ok(!DEFAULT_OPERATORS.some(([name]) => /Juan M/.test(name)));
});
