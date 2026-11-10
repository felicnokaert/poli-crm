import test from 'node:test';
import assert from 'node:assert/strict';
import { draftCandidates } from '../src/assistant-draft.mjs';
import { buildDraftMessages, parseDraft } from '../lib/assistant-ai.mjs';

test('parseDraft: clara, conflicto y formato roto', () => {
  assert.deepEqual(parseDraft('{"estado":"clara","respuesta":"Rinde 1 kg por m2.","nota":""}'), { state: 'clara', answer: 'Rinde 1 kg por m2.', note: '' });
  const conflict = parseDraft('{"estado":"conflicto","respuesta":"x","nota":"unas dicen 1 kg y otras 5 kg"}');
  assert.equal(conflict.state, 'conflicto');
  assert.equal(conflict.answer, '');
  assert.equal(parseDraft('{"estado":"clara","respuesta":"","nota":""}').state, 'insuficiente');
  assert.equal(parseDraft('no se').state, 'insuficiente');
});

test('parseDraft saca links de la respuesta', () => {
  assert.doesNotMatch(parseDraft('{"estado":"clara","respuesta":"Mirá https://x.com/a rinde 1 kg","nota":""}').answer, /https?:/);
});

test('buildDraftMessages arma producto, tema y respuestas', () => {
  const [message] = buildDraftMessages({ product: 'Poxiplast', topic: 'Rendimiento', pairs: [{ question: 'cuanto rinde', answer: 'Rinde 1 kg por m2' }] });
  assert.match(message.content, /PRODUCTO: Poxiplast/);
  assert.match(message.content, /Rinde 1 kg por m2/);
});

test('draftCandidates: 2 respuestas distintas del mismo tema, sin lo ya enseñado', () => {
  const titles = { A: 'Resina Poxiplast 750 g', B: 'Resina Poxiplast 3 kg' };
  const questions = [
    { item_id: 'A', question: 'cuanto rinde por m2?', answer: 'Hola, rinde aproximadamente 1 kg por m2 a 1 mm de espesor.' },
    { item_id: 'B', question: 'cuanto rinde?', answer: 'Buenas, con 3 kg cubrís unos 2 m2 con una capa gruesa de resina.' },
    { item_id: 'A', question: 'cuanto dura el pomo?', answer: 'Sí.' },
  ];
  const list = draftCandidates(questions, titles);
  assert.equal(list.length, 1);
  assert.equal(list[0].pairs.length, 2);
  assert.match(list[0].product, /Poxiplast/i);
  assert.equal(draftCandidates(questions, titles, { taught: [{ product: list[0].product, question: list[0].question }] }).length, 0);
});
