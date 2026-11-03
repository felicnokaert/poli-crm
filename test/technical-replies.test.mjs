import test from 'node:test';
import assert from 'node:assert/strict';
import { TECH_TOPICS, searchText, technicalAnswer, whatsappText } from '../src/technical-replies.mjs';

const row = (answer) => ({ kind: 'pregunta', body: `Pregunta: cuanto rinde\nRespuesta: ${answer}` });

test('temas: están los técnicos y no envíos', () => {
  const keys = TECH_TOPICS.map((topic) => topic.key);
  assert.ok(keys.includes('rendimiento') && keys.includes('tiempos') && keys.includes('espesor'));
  assert.ok(!keys.includes('envios'));
});

test('arma la búsqueda con producto y tema', () => {
  assert.match(searchText('poxiplast', 'tiempos').q, /poxiplast/);
  assert.equal(searchText('poxiplast', 'nada').q, '');
});

test('devuelve lo que el equipo repite y lo enseñado, sin inventar', () => {
  const rows = [row('Rinde 1 kg por m2 a 1 mm de espesor.'), row('Hola! Rinde 1 kg por m2 a 1 mm de espesor. Saludos'), row('Rinde 1 kg por m2 a 1 mm de espesor.')];
  const taught = [{ id: 1, question: 'rendimiento poxiplast', product: 'poxiplast', answer: 'Rinde 1 kg/m2 a 1 mm.' }, { id: 2, question: 'x', product: 'regla', answer: 'regla interna' }];
  const result = technicalAnswer({ rows, taught, product: 'poxiplast', topicKey: 'rendimiento' });
  assert.ok(result.team && result.team.uses >= 2);
  assert.equal(result.taught.length, 1);
  assert.ok(!result.taught.some((entry) => entry.product === 'regla'));
});

test('sin datos no devuelve respuesta', () => {
  const result = technicalAnswer({ rows: [], taught: [], product: 'poxiplast', topicKey: 'rendimiento' });
  assert.equal(result.team, null);
  assert.equal(result.taught.length, 0);
  assert.deepEqual(technicalAnswer({ product: '', topicKey: 'tiempos' }), { taught: [], team: null });
});

test('texto de WhatsApp lleva saludo y pregunta de seguimiento', () => {
  assert.match(whatsappText('Rinde 1 kg por m2.', { nombre: 'Ana' }), /^Hola Ana, Rinde/);
  assert.match(whatsappText('x'), /Para qué lo vas a usar/);
});
