import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplyContext } from '../src/reply-context.mjs';

test('contexto de la respuesta sugerida: solo datos verificados y preguntas que faltan', () => {
  const text = buildReplyContext({
    family: 'Espumas', intent: 'Cotización', isFollowUp: true,
    missingQuestions: ['¿Qué superficie?', '¿Cuántos m²?'],
    technicalFields: { rendimiento: '1 kg por m² a 1 mm', precio: 'pendiente de verificar contra ficha validada' },
    recommendedDocs: [{ product: 'PU-46' }],
  });
  assert.match(text, /Familia de producto detectada: Espumas/);
  assert.match(text, /¿Qué superficie\?/);
  assert.match(text, /rendimiento: 1 kg por m² a 1 mm/);
  assert.doesNotMatch(text, /precio:/);
  assert.match(text, /Fichas disponibles para mandarle: PU-46/);
  assert.equal(buildReplyContext({}), '');
});
