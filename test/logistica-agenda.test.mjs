import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAS, DIAS_CORTO, agendaDe, alternar } from '../src/logistica/agendaConteo.mjs';

// 28/11 (Felipe): se trabaja de lunes a viernes; la agenda no tiene sábado.
test('Agenda de conteo: solo lunes a viernes', () => {
  assert.deepEqual(Object.keys(DIAS), ['1', '2', '3', '4', '5']);
  assert.deepEqual(Object.keys(DIAS_CORTO), ['1', '2', '3', '4', '5']);
  const a = agendaDe({ agenda: { 6: { personas: ['Neyen'], familias: ['x'] }, 1: { personas: ['Marcos'], familias: [] } } });
  assert.equal(a[6], undefined);
  assert.deepEqual(a[1].personas, ['Marcos']);
  assert.deepEqual(alternar(a, 1, 'personas', 'Marcos')[1].personas, []);
});
