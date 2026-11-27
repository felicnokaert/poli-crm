import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK } from '../lib/feriados.mjs';
import { PLAN_HOLIDAYS, PLAN_LIGHT_DAYS } from '../src/plan-calendar.mjs';
import { PLAN_HOLIDAYS as TRELLO_HOLIDAYS, PLAN_END } from '../src/trello-plan.mjs';

// 27/11: las listas a mano (plan del día, Trello, Entregas) no pueden quedar atrás de la lista oficial del servidor
// (el 9/11 faltó). Todo feriado oficial dentro del plan tiene que estar como feriado o como día liviano (los «puente»).
test('los feriados a mano cubren la lista oficial del servidor dentro del plan', () => {
  const desde = PLAN_HOLIDAYS[0].slice(0, 7) + '-01';
  for (const { fecha, tipo } of FALLBACK[2026].filter((day) => day.fecha >= desde && day.fecha <= PLAN_END)) {
    const listed = PLAN_HOLIDAYS.includes(fecha) || (tipo === 'puente' && PLAN_LIGHT_DAYS.includes(fecha));
    assert.ok(listed, `falta ${fecha} (${tipo}) en PLAN_HOLIDAYS`);
  }
  assert.deepEqual(TRELLO_HOLIDAYS, PLAN_HOLIDAYS);
});
