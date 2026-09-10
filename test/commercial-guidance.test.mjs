import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommercialGuidance, detectObjection, methodStageFor } from '../src/commercial-guidance.mjs';

test('maps the operational pipeline to the 12-stage commercial method', () => {
  assert.equal(methodStageFor({ stage: 'Conversación' }).label, 'Diagnóstico');
  assert.equal(methodStageFor({ stage: 'Ganado' }).label, 'Posventa');
});

test('detects a real objection without generating a response or technical claim', () => {
  const objection = detectObjection('Está caro y tengo que revisar el presupuesto');
  assert.equal(objection.id, 'precio');
  assert.match(objection.explore, /comparando/i);
});

test('builds traceable company guidance from family, stage and latest interaction', () => {
  const result = buildCommercialGuidance({
    client: { family: 'CARROZADOS', stage: 'Calificado' },
    interactions: [{ createdAt: '2026-09-10T12:00:00Z', objection: 'Ya tengo proveedor' }],
  });
  assert.equal(result.stage.label, 'Calificación');
  assert.equal(result.playbook.id, 'fabricantes');
  assert.equal(result.objection.id, 'proveedor');
  assert.equal(result.ecera.length, 5);
  assert.ok(result.reasons.every(Boolean));
});

test('does not invent a profile when family is unknown', () => {
  const result = buildCommercialGuidance({ client: { family: 'Sin definir' } });
  assert.equal(result.playbook, null);
  assert.deepEqual(result.crossSellFamilies, []);
  assert.match(result.reasons[1], /pendiente/i);
});
