import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDuplicateClientCandidates } from '../src/duplicate-candidates.mjs';

test('suggests same CUIT as high confidence but always requires human review', () => {
  const [candidate] = detectDuplicateClientCandidates([
    { id: 'a', company: 'Empresa A', cuit: '30-12345678-9' },
    { id: 'b', company: 'Otro nombre', cuit: '30123456789' },
  ]);
  assert.equal(candidate.confidence, 'high');
  assert.equal(candidate.requiresHumanReview, true);
  assert.deepEqual(candidate.signals.map((item) => item.type), ['cuit_exact']);
});

test('same normalized company name alone is low confidence and never merged', () => {
  const [candidate] = detectDuplicateClientCandidates([
    { id: 'web', company: 'Carrocería Argentina' },
    { id: 'phone', company: 'CARROCERIA ARGENTINA' },
  ]);
  assert.equal(candidate.confidence, 'low');
  assert.equal(candidate.requiresHumanReview, true);
});

test('two strong matching signals rank as high confidence', () => {
  const [candidate] = detectDuplicateClientCandidates([
    { id: 'a', company: 'Uno', contacts: [{ phone: '+54 9 11 4444-5555', email: 'ventas@empresa.com' }] },
    { id: 'b', company: 'Dos', contacts: [{ phone: '11 4444 5555', email: 'VENTAS@EMPRESA.COM' }] },
  ]);
  assert.equal(candidate.confidence, 'high');
  assert.deepEqual(candidate.signals.map((item) => item.type), ['phone_exact', 'email_exact']);
});

test('does not produce candidates without evidence', () => {
  assert.deepEqual(detectDuplicateClientCandidates([
    { id: 'a', company: 'Distribuidora del Norte' },
    { id: 'b', company: 'Distribuidora del Sur' },
  ]), []);
});

test('returns stable confidence ordering', () => {
  const result = detectDuplicateClientCandidates([
    { id: 'a', company: 'Igual', cuit: '30-1', contacts: [{ phone: '1144445555' }] },
    { id: 'b', company: 'Igual', cuit: '30-1', contacts: [{ phone: '1144445555' }] },
    { id: 'c', company: 'Igual' },
  ]);
  assert.equal(result[0].confidence, 'high');
  assert.equal(result.at(-1).confidence, 'low');
});
