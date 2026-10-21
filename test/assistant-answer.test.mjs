import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAnswer, detectIntent, guideFacts, mlQuery, productWords, teamAnswer } from '../src/assistant-answer.mjs';

const row = (answer) => ({ kind: 'pregunta', body: `Pregunta: ¿cuánto rinde?\nRespuesta: ${answer}` });
const STANDARD = 'Dependerá de que tipo de revestimiento quieras hacer. Para una pintada de protección se calculan 200 gramos x M2. En el caso de querer lograr un revestimiento epoxi de 1mm de espesor se calcula 1 kilo x M2.';

test('reconoce el tema y el producto de la pregunta', () => {
  const intent = detectIntent('rendimiento epoxi por kilo');
  assert.equal(intent.key, 'rendimiento');
  assert.deepEqual(productWords('rendimiento epoxi por kilo', intent), ['epoxi']);
  assert.equal(detectIntent('cuanto tarda en secar la epoxi').key, 'tiempos');
  assert.deepEqual(productWords('cuanto tarda en secar la epoxi', detectIntent('cuanto tarda en secar la epoxi')), ['epoxi']);
  assert.equal(detectIntent('poliurea'), null);
  assert.equal(mlQuery('rinde la epoxi', detectIntent('rinde la epoxi')), 'epoxi rinde or epoxi rendimiento or epoxi cubre or epoxi m2');
});

test('saca el saludo con el usuario y la firma', () => {
  assert.equal(cleanAnswer('Hola MARY 20080 el tiempo es de 24 horas. Saludos de Grupo Poliplast'), 'el tiempo es de 24 horas.');
  assert.equal(cleanAnswer('Hola CAE1984 Dependerá del uso. Saludos Brenda de Grupo Poliplast'), 'Dependerá del uso.');
  assert.equal(cleanAnswer('Hola MIRNA2008A Se calcula 1 kilo x M2 de Grupo Poliplast'), 'Se calcula 1 kilo x M2');
});

test('la respuesta del equipo es la que más se repite, con cuántas veces', () => {
  const rows = [row(`Hola AAA1 ${STANDARD} Saludos Brenda de Grupo Poliplast`), row(`Hola BBB2 Si sirve. ${STANDARD} de Foam Factory.`), row(`Hola CCC ${STANDARD}`), row('Hola DDD Rinde 2 kg por m² con cuarzo.')];
  const answer = teamAnswer(rows, detectIntent('cuanto rinde'));
  assert.equal(answer.varied, undefined);
  assert.equal(answer.text, 'Para una pintada de protección se calculan 200 gramos x M2. En el caso de querer lograr un revestimiento epoxi de 1mm de espesor se calcula 1 kilo x M2.');
  assert.equal(answer.uses, 3);
  assert.equal(answer.total, 4);
});

test('si las respuestas no coinciden, muestra las frases con el dato y avisa', () => {
  const rows = [row('Hola X1 El curado total es de 24hs. Saludos'), row('Hola X2 Se despega fácil del vaso.'), row('Hola X3 Su curado máximo es de 7 días.')];
  const answer = teamAnswer(rows, detectIntent('cuanto tarda el curado'));
  assert.equal(answer.varied, true);
  assert.deepEqual(answer.examples, ['El curado total es de 24hs.', 'Su curado máximo es de 7 días.']);
});

test('de las guías trae solo las líneas del tema', () => {
  const guides = [
    { product: 'PoxiPlast (resina epoxi)', family: 'Resinplast', summary: 'Epoxi cristalina', status: 'borrador', sections: [{ title: 'Datos clave', items: ['Mezcla 2:1 en volumen.', 'Rendimiento: pintada de protección 200 g por m²; revestimiento de 1 mm, 1 kg por m².'] }, { title: 'Qué preguntarle al cliente', items: ['¿Qué superficie y cuántos m2?'] }] },
    { product: 'Espuma 40 kg', family: 'Poliuretano', summary: 'Aislante', sections: [{ title: 'Datos', items: ['Rendimiento 40 kg por m3'] }] },
  ];
  const facts = guideFacts(guides, 'cuanto rinde la epoxi', detectIntent('cuanto rinde la epoxi'));
  assert.deepEqual(facts.map((fact) => fact.text), ['Rendimiento: pintada de protección 200 g por m²; revestimiento de 1 mm, 1 kg por m².']);
});

test('agrupa la misma respuesta escrita distinto (Easy Spray)', async () => {
  const { teamAnswer: answerOf, quantities, mlQuery: queryOf } = await import('../src/assistant-answer.mjs');
  assert.deepEqual(quantities('Cada envase rinde 2m2 en un espesor de 2cm.'), ['2 m2', '20 mm']);
  assert.deepEqual(quantities('2 M2 en 20 mm de espesor'), ['2 m2', '20 mm']);
  const rows = [row('Hola A1 Cada envase rinde 2m2 en un espesor de 2cm. Saludos Brenda'), row('Hola B2 2 M2 en 20 mm de espesor aproximadamente.'), row('Hola C3 Cada Easyspray cubre 2 m² en 2 cm de espesor.'), row('Hola D4 Te dejamos el link de la pistola.')];
  const answer = answerOf(rows, detectIntent('cuanto rinde el easy spray'));
  assert.equal(answer.uses, 3);
  assert.equal(answer.total, 4);
  assert.match(answer.text, /2/);
  assert.match(queryOf('rendimiento easy spray', detectIntent('rendimiento easy spray')), /easyspray rinde/);
});

test('lo que enseñó Felipe aparece si la pregunta coincide y nombra el producto', async () => {
  const { matchTaught } = await import('../src/assistant-answer.mjs');
  const entries = [
    { id: 1, question: '¿Cuánto rinde?', product: 'Easy Spray', answer: '2 m² a 2 cm.' },
    { id: 2, question: '¿Cuánto rinde?', product: 'PoxiPlast', answer: '1 kg por m² a 1 mm.' },
    { id: 3, question: 'Horario de atención', product: '', answer: 'Lunes a viernes de 8 a 17.' },
  ];
  assert.deepEqual(matchTaught(entries, 'cuanto rinde el easy spray').map((e) => e.id), [1]);
  assert.deepEqual(matchTaught(entries, 'rinde easyspray').map((e) => e.id), [1]);
  assert.deepEqual(matchTaught(entries, 'horario de atencion').map((e) => e.id), [3]);
  assert.deepEqual(matchTaught(entries, 'rinde la espuma'), []);
});
