import assert from 'node:assert/strict';
import test from 'node:test';
import { blankOpportunity, PRIORITY_CRITERIA, SALES_METHOD_STAGES } from '../src/opportunities-model.mjs';

test('opportunities use the complete Poliplast sales method', () => {
  assert.deepEqual(SALES_METHOD_STAGES, ['Preparación', 'Apertura', 'Diagnóstico', 'Calificación', 'Recomendación', 'Objeción', 'Propuesta', 'Seguimiento', 'Negociación', 'Cierre', 'Posventa', 'Recompra']);
  const opportunity = blankOpportunity('client-1');
  assert.equal(opportunity.clientId, 'client-1');
  assert.equal(opportunity.stage, 'Preparación');
  assert.equal(opportunity.objection, '');
  assert.equal(opportunity.priorityCriterion, 'A confirmar');
  assert.ok(PRIORITY_CRITERIA.includes('Cuenta estratégica'));
});
