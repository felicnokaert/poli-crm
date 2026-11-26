import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAN_HOLIDAYS } from '../src/plan-calendar.mjs';

test('Entregas marca los mismos feriados que el Calendario del CRM', () => {
  const text = readFileSync(new URL('../entregas/src/lib/feriados.ts', import.meta.url), 'utf8');
  const list = JSON.parse(text.match(/FERIADOS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(list, PLAN_HOLIDAYS);
});
