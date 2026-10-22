import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuestions, trainingContext, trainingQuestion } from '../src/assistant-training.mjs';

const q = (id, item, question, answer) => ({ id, item_id: item, question, answer });
const questions = [
  q('1', 'A', 'Hola, cuanto rinde?', 'Hola! Rinde 2 m2 en 2 cm de espesor. Saludos'),
  q('2', 'A', 'cuantos metros cubre?', 'Rinde 2 m² en 20 mm de espesor.'),
  q('3', 'A', 'que rendimiento tiene?', 'Rinde 2m2 en 2cm.'),
  q('4', 'A', 'tienen stock?', 'Sí, hay stock.'),
  q('5', 'B', 'cuanto tarda en secar?', 'Seca en 24 horas.'),
  q('6', 'B', 'hola', 'hola'),
  q('7', 'C', 'cuanto rinde?', 'Rinde 1 kg por m2.'),
];

test('elige una pregunta con tema por publicación, de publicaciones con varias respuestas', () => {
  const picked = pickQuestions(questions, { A: 'Easy Spray 2 kg', B: 'Epoxi' }, { count: 5, seed: 3 });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].item_id, 'A');
  assert.equal(picked[0].intent.key, 'rendimiento');
  assert.match(trainingQuestion(picked[0]), /^Un cliente pregunta por "Easy Spray 2 kg": /);
});

test('a la IA no le llega la respuesta real, sí las demás de la publicación', () => {
  const row = { ...questions[0], title: 'Easy Spray', intent: null };
  const { team, context } = trainingContext(row, questions.filter((other) => other.item_id === 'A'));
  assert.equal(context.includes('Hola, cuanto rinde?'), false);
  assert.match(context, /cuantos metros cubre/);
  assert.equal(team.uses, 2);
  assert.match(context, /Respuesta del equipo en Mercado Libre/);
});

import { shortProduct, suggestTeachings } from '../src/assistant-training.mjs';

test('sugeridas: la respuesta repetida por publicación y tema, con el producto corto', () => {
  assert.equal(shortProduct('Resina Epoxi Cristal Easy Spray 2 Kg'), 'Easy Spray');
  const list = suggestTeachings(questions, { A: 'Resina Easy Spray 2 Kg' });
  assert.equal(list.length, 1);
  assert.equal(list[0].product, 'Easy Spray');
  assert.match(list[0].question, /^Rendimiento \(rinde/);
  assert.equal(list[0].uses, 3);
  assert.equal(suggestTeachings(questions, { A: 'Resina Easy Spray 2 Kg' }, { taught: [{ product: 'Easy Spray', question: list[0].question }] }).length, 0);
});

test('answerHasGap: anota sola las respuestas en las que a la IA le faltó el dato', async () => {
  const { answerHasGap } = await import('../src/assistant-training.mjs');
  assert.equal(answerHasGap('Dato general (no es de Poliplast, conviene verificar): el poliuretano…'), true);
  assert.equal(answerHasGap('No tengo ese dato cargado. Consultá con Juan.'), true);
  assert.equal(answerHasGap('El contexto no trae precios, así que no lo pude verificar.'), true);
  assert.equal(answerHasGap('Rinde 2 m² en 2 cm de espesor. Fuente: Mercado Libre.'), false);
});

test('sugeridas: la misma respuesta en variantes del producto (700 g, 450 g, 25 kg) aparece una sola vez', async () => {
  const { baseProduct } = await import('../src/assistant-training.mjs');
  const variant = (item, n) => [
    { id: `${item}1`, item_id: item, question: 'cuanto rinde?', answer: `Rinde 1 kg por m2 en 1 mm. ${n}` },
    { id: `${item}2`, item_id: item, question: 'que rendimiento tiene?', answer: 'Rinde 1 kg por m2 en 1 mm.' },
    { id: `${item}3`, item_id: item, question: 'cuantos metros cubre?', answer: 'Rinde 1 kg x m2 en 1 mm de espesor.' },
  ];
  const rows = [...variant('X', ''), ...variant('Y', ''), ...variant('Z', '')];
  const titles = { X: 'Resina Epoxi Bicomponente 700 Gr', Y: 'Resina Epoxi Bicomponente 450 g', Z: 'Resina Epoxi Bicomponente x 25 Kg' };
  const list = suggestTeachings(rows, titles);
  assert.equal(list.length, 1);
  assert.equal(list[0].product, 'Resina Epoxi Bicomponente');
  assert.equal(list[0].titles.length, 3);
  assert.equal(list[0].uses, 9);
  assert.match(list[0].title, /^3 variantes/);
  assert.equal(baseProduct(['Resina Epoxi Cristal 700 Gr']), 'Resina Epoxi Cristal');
});
