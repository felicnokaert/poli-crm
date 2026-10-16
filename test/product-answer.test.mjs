import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, detectTopics, productTokens, questionPrompt } from '../src/product-answer.mjs';

const docs = [
  { id: 'd618', title: 'PDS isoBUNKER 618-SP', product: 'Ficha Técnica 618 SP', family: 'Poliuretano', status: 'inventariado',
    extractedText: 'isoBUNKER 618-SP\nSistema de poliuretano proyectable\nTemperatura de trabajo\n45 - 50 °C en manguera y pistola\nDensidad libre 38-42 kg/m³\nTiempo de crema 3-5 segundos\nAlmacenar entre 15 y 25 °C' },
  { id: 'dez', title: 'Penosil Easy Spray', product: 'Easy Spray', family: 'Selladores', status: 'vigente',
    extractedText: 'PENOSIL EasySpray espuma de poliuretano\nRendimiento: hasta 45 L de espuma por aerosol de 750 ml\nTemperatura de aplicación +5 °C a +35 °C' },
  { id: 'dx', title: 'Manual bomba PURMAC', family: 'Máquinas', extractedText: 'Presión de trabajo 120 bar' },
];

test('reconoce el dato y el producto de la pregunta', () => {
  assert.deepEqual(detectTopics('¿Con qué temperatura se trabaja el 618 SP?'), ['temperatura']);
  assert.deepEqual(detectTopics('cuánto rinde penosil easy spray'), ['rendimiento']);
  assert.deepEqual(productTokens('¿Con qué temperatura se trabaja el poliuretano 618 SP?'), ['poliuretano', '618']);
  assert.deepEqual(productTokens('cuánto rinde penosil easy spray'), ['penosil', 'easy', 'spray']);
});

test('responde la temperatura del 618 SP con la línea literal de la ficha', () => {
  const answer = answerQuestion('¿Con qué temperatura se trabaja el 618 SP?', docs);
  assert.equal(answer.results[0].doc.id, 'd618');
  assert.ok(answer.answered);
  assert.ok(answer.results[0].lines.some((line) => line.includes('45 - 50 °C')));
});

test('responde cuánto rinde Penosil Easy Spray', () => {
  const answer = answerQuestion('cuánto rinde penosil easy spray', docs);
  assert.equal(answer.results[0].doc.id, 'dez');
  assert.deepEqual(answer.results[0].lines, ['Rendimiento: hasta 45 L de espuma por aerosol de 750 ml']);
});

test('si la ficha no tiene el dato, no inventa', () => {
  const answer = answerQuestion('qué viscosidad tiene el 618', docs);
  assert.equal(answer.results[0].doc.id, 'd618');
  assert.equal(answer.answered, false);
  assert.match(questionPrompt('qué viscosidad tiene el 618', answer.results), /no lo inventes/);
});

test('sin producto reconocible no devuelve fichas al azar', () => {
  assert.equal(answerQuestion('qué temperatura', docs).results.length, 0);
});
