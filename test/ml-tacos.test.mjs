import test from 'node:test';
import assert from 'node:assert/strict';
import { tacosFor, TACOS_TARGET } from '../src/ml-tacos.mjs';

const now = Date.parse('2026-10-24T12:00:00Z');
const saved = (days, spend) => ({ savedAt: new Date(now - days * 86400000).toISOString(), summary: { spend } });

test('sin tabla pegada: "sin datos", nunca 0 %', () => {
  assert.equal(tacosFor({ sales30: 1000000, report: null, now }).state, 'sin-datos');
  assert.equal(tacosFor({ sales30: 1000000, report: { savedAt: saved(1).savedAt, summary: {} }, now }).tacos, null);
});

test('con la inversión pegada: TACoS = inversión ÷ ventas totales, alto sobre el 17 %', () => {
  const ok = tacosFor({ sales30: 10000000, report: saved(2, 1000000), now });
  assert.equal(ok.state, 'estimado');
  assert.equal(ok.tacos, 0.1);
  assert.equal(ok.high, false);
  const alto = tacosFor({ sales30: 10000000, report: saved(2, 1830000), now });
  assert.equal(alto.high, true);
  assert.ok(alto.tacos > TACOS_TARGET);
});

test('datos viejos se marcan y sin ventas leídas no se inventa un número', () => {
  assert.equal(tacosFor({ sales30: 10000000, report: saved(20, 1000000), now }).state, 'desactualizado');
  const none = tacosFor({ sales30: null, report: saved(1, 1000000), now });
  assert.equal(none.state, 'sin-ventas');
  assert.equal(none.tacos, null);
});
