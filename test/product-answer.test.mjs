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

test('responde con una ficha de Penosil en inglés (Technical Data Sheet)', () => {
  const tds = 'PENOSIL EasySpray Foam 111\nSprayable gun foam\nDensity 12…16 kg/m³\nOutput (1 layer) 1 m²/can\nAir temperature during use: +10 °C to +30 °C.\nCan temperature during application: +18 °C to +28 °C, best results at +20 °C.\nGuaranteed shelf life is 12 months from production date';
  const docs = [{ id: 'pen111', title: 'PENOSIL EasySpray Foam 111 - Ficha técnica (TDS)', status: 'inventariado', extractedText: tds }];
  const rinde = answerQuestion('¿cuánto rinde Penosil Easy Spray?', docs);
  assert.equal(rinde.results[0].doc.id, 'pen111');
  assert.ok(rinde.results[0].lines.some((line) => line.includes('1 m²/can')));
  const temp = answerQuestion('¿a qué temperatura se aplica el easyspray?', docs);
  assert.ok(temp.results[0].lines.some((line) => line.includes('+10 °C to +30 °C')));
  const vence = answerQuestion('¿cuánto dura almacenado el easyspray?', docs);
  assert.ok(vence.results[0].lines.some((line) => line.includes('12 months')));
});

test('pedido de solución: ordena las fichas por cuánto encajan y muestra por qué', async () => {
  const { answerQuestion, needConcepts } = await import('../src/product-answer.mjs');
  const catalog = [
    { id: 'rigida', title: 'isoBUNKER 618-SP', status: 'vigente', extractedText: 'Sistema de espuma rígida de poliuretano proyectable\nAislación térmica de techos y cámaras\nConductividad térmica 0,022 W/mK' },
    { id: 'spray', title: 'PENOSIL EasySpray Foam 111', status: 'inventariado', extractedText: 'Sprayable gun foam\nHigh thermal and acoustic insulation value\nThermal conductivity 0,033 W/(m·K)' },
    { id: 'epoxi', title: 'Poxiplast', extractedText: 'Adhesivo epoxi bicomponente para metal y madera' },
  ];
  assert.deepEqual(needConcepts('algo que aísle térmicamente y sea espuma rígida de PU').map((c) => c.key), ['aisl', 'termic', 'espuma', 'rigid', 'poliuretano']);
  const answer = answerQuestion('algo que aísle térmicamente y sea espuma rígida de PU', catalog);
  assert.equal(answer.mode, 'recomendacion');
  assert.equal(answer.results[0].doc.id, 'rigida', 'la que cubre más partes del pedido va primero');
  assert.ok(answer.results.some((r) => r.doc.id === 'spray'), 'encuentra también la ficha en inglés');
  assert.ok(!answer.results.some((r) => r.doc.id === 'epoxi'));
  assert.ok(answer.results[0].lines.length > 0);
});
