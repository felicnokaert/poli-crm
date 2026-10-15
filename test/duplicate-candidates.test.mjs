import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDuplicateReviewDecisions, detectDuplicateClientCandidates } from '../src/duplicate-candidates.mjs';

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

test('scans a large mostly-unique portfolio without quadratic comparisons', () => {
  const clients = Array.from({ length: 2000 }, (_, index) => ({
    id: `client-${index}`,
    company: `Empresa única ${index}`,
    cuit: `30${String(index).padStart(8, '0')}1`,
    contacts: [{ phone: `11${String(index).padStart(8, '0')}` }],
  }));
  clients.push({ id: 'duplicate', company: 'Empresa única 17', cuit: clients[17].cuit });
  const startedAt = performance.now();
  const result = detectDuplicateClientCandidates(clients);
  assert.equal(result.length, 1);
  assert.equal(result[0].confidence, 'high');
  assert.ok(performance.now() - startedAt < 250);
});

test('applyDuplicateReviewDecisions: a pair marked "no son duplicados" never reaparece, aunque cambien las señales', () => {
  const clients = [
    { id: 'a', company: 'Uno', cuit: '30-1' },
    { id: 'b', company: 'Uno', cuit: '30-1' },
  ];
  const candidates = detectDuplicateClientCandidates(clients);
  const [candidate] = candidates;
  const decisions = [{ id: candidate.id, decision: 'not_duplicate', signalsAtDecision: candidate.signals.map((s) => s.type) }];
  assert.deepEqual(applyDuplicateReviewDecisions(candidates, decisions), []);

  // Ahora aparece una señal nueva (teléfono también coincide): sigue sin
  // reaparecer porque la decisión "no son duplicados" es permanente.
  clients[0].contacts = [{ phone: '1144445555' }];
  clients[1].contacts = [{ phone: '1144445555' }];
  const laterCandidates = detectDuplicateClientCandidates(clients);
  assert.deepEqual(applyDuplicateReviewDecisions(laterCandidates, decisions), []);
});

test('applyDuplicateReviewDecisions: un par "postponed" se oculta mientras las señales sean las mismas', () => {
  const clients = [
    { id: 'a', company: 'Poliplast Sur' },
    { id: 'b', company: 'Poliplast Sur' },
  ];
  const candidates = detectDuplicateClientCandidates(clients);
  const [candidate] = candidates;
  const decisions = [{ id: candidate.id, decision: 'postponed', signalsAtDecision: candidate.signals.map((s) => s.type) }];
  assert.deepEqual(applyDuplicateReviewDecisions(candidates, decisions), []);
});

test('applyDuplicateReviewDecisions: un par "postponed" reaparece si surge una señal nueva', () => {
  const clients = [
    { id: 'a', company: 'Poliplast Sur' },
    { id: 'b', company: 'Poliplast Sur' },
  ];
  const before = detectDuplicateClientCandidates(clients);
  const [candidate] = before;
  const decisions = [{ id: candidate.id, decision: 'postponed', signalsAtDecision: candidate.signals.map((s) => s.type) }];
  assert.deepEqual(applyDuplicateReviewDecisions(before, decisions), []);

  // Se agrega una coincidencia de CUIT: es información nueva que Felipe no
  // vio al postergar, así que el candidato debe reaparecer.
  clients[0].cuit = '30-12345678-9';
  clients[1].cuit = '30123456789';
  const after = detectDuplicateClientCandidates(clients);
  const visible = applyDuplicateReviewDecisions(after, decisions);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, candidate.id);
});

import { detectDuplicateClientCandidates as detectDup } from '../src/duplicate-candidates.mjs';
const mkc = (id, company, extra = {}) => ({ id, company, contacts: [], ...extra });

test('un mail usado por 3 o más fichas (contador, mail del equipo) no genera duplicados', () => {
  const c = detectDup([mkc('1', 'Alfa SA', { email: 'conta@estudio.com' }), mkc('2', 'Beta SRL', { email: 'conta@estudio.com' }), mkc('3', 'Gamma SA', { email: 'conta@estudio.com' })]);
  assert.equal(c.length, 0);
});

test('el mail propio de la empresa no marca duplicados', () => {
  const c = detectDup([mkc('1', 'Alfa SA', { email: 'felipe@grupopoliplast.com.ar' }), mkc('2', 'Beta SRL', { email: 'felipe@grupopoliplast.com.ar' })]);
  assert.equal(c.length, 0);
});

test('mismo teléfono con nombres sin relación queda en "revisar" (baja), con nombre parecido sigue en media', () => {
  const distinct = detectDup([mkc('1', 'Mundo Ambiental SRL', { phone: '1140571045' }), mkc('2', 'Daniel Petitti Repuestos', { phone: '1140571045' })]);
  assert.equal(distinct[0].confidence, 'low');
  const similar = detectDup([mkc('1', 'Purcat', { phone: '3834022006' }), mkc('2', 'Purcat S. R. L.', { phone: '3834022006' })]);
  assert.notEqual(similar[0].confidence, 'low');
});
