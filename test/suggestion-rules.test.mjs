import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuggestion, PENDING_TECHNICAL_FIELDS } from '../src/suggestion-rules.mjs';

test('detects family and intent from keywords with rule provenance', () => {
  const suggestion = buildSuggestion({ channel: 'penosil', text_body: 'Hola, necesito precio de Penosil para sellar juntas' });
  assert.equal(suggestion.family, 'Penosil');
  assert.equal(suggestion.intent, 'Precio / cotización');
  assert.equal(suggestion.provenance.family, 'regla_aprobada');
  assert.equal(suggestion.provenance.intent, 'regla_aprobada');
});

test('falls back to "Sin definir" family without inventing one', () => {
  const suggestion = buildSuggestion({ channel: 'general', text_body: 'hola' });
  assert.equal(suggestion.family, 'Sin definir');
  assert.deepEqual(suggestion.missingQuestions, ['¿Qué producto o familia le interesa?', '¿Cuál es la aplicación que tiene en mente?']);
});

test('a generic Penosil opening on the penosil channel is treated as Penosil interest', () => {
  const suggestion = buildSuggestion({ channel: 'penosil', text_body: 'Quiero más información' });
  assert.equal(suggestion.family, 'Penosil');
});

test('temperature reflects urgency plus commercial intent, never invented', () => {
  assert.equal(buildSuggestion({ text_body: 'necesito cotizar urgente para hoy' }).temperature, 'Caliente');
  assert.equal(buildSuggestion({ text_body: 'quiero cotizar precio' }).temperature, 'Tibio');
  assert.equal(buildSuggestion({ text_body: 'hola, buen dia' }).temperature, 'Frío');
});

test('recommends technical documents by family without asserting their content', () => {
  const suggestion = buildSuggestion({ text_body: 'consulta sobre isoBUNKER poliuretano rígido' });
  assert.equal(suggestion.family, 'Poliuretano');
  assert.ok(suggestion.recommendedDocs.length > 0);
  for (const doc of suggestion.recommendedDocs) {
    assert.equal(doc.verified, false);
    assert.ok(!('content' in doc));
  }
  assert.equal(suggestion.provenance.recommendedDocs, 'metadata_ficha');
});

test('every technical field is explicitly pending, never a guessed value', () => {
  const suggestion = buildSuggestion({ text_body: 'cuanto rinde el producto y que precio tiene' });
  for (const field of PENDING_TECHNICAL_FIELDS) {
    assert.equal(suggestion.technicalFields[field], 'Pendiente de verificar (sin ficha validada)');
  }
  assert.equal(suggestion.provenance.technicalFields, 'pendiente_de_validacion');
});

test('draft message never states a technical claim, only cites doc names and asks questions', () => {
  const suggestion = buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano para techo' });
  assert.ok(suggestion.draftMessage.includes('Pendiente de verificar'));
  assert.ok(!/rinde \d|kg\/m|resistente a|compatible con \w+ °c/i.test(suggestion.draftMessage));
  for (const doc of suggestion.recommendedDocs) {
    assert.ok(suggestion.draftMessage.includes(doc.product));
  }
});

test('a short closing/thank-you message does not trigger a diagnostic questionnaire', () => {
  for (const text of ['Gracias!', 'muchas gracias', 'Dale', 'perfecto', 'Ok, gracias!']) {
    const suggestion = buildSuggestion({ text_body: text });
    assert.equal(suggestion.isClosingMessage, true, `expected "${text}" to be detected as closing`);
    assert.deepEqual(suggestion.missingQuestions, []);
    assert.deepEqual(suggestion.recommendedDocs, []);
    assert.match(suggestion.draftMessage, /historial/i);
    assert.doesNotMatch(suggestion.draftMessage, /qué producto/i);
  }
});

test('a longer message that happens to start with a closing word is not misclassified', () => {
  const suggestion = buildSuggestion({ text_body: 'Gracias, pero necesito cotizar 200 litros de resina para un proyecto grande' });
  assert.equal(suggestion.isClosingMessage, false);
  assert.ok(suggestion.missingQuestions.length > 0);
});

test('handles missing/empty event fields without throwing', () => {
  assert.doesNotThrow(() => buildSuggestion());
  assert.doesNotThrow(() => buildSuggestion({}));
  const suggestion = buildSuggestion({ text_body: '' });
  assert.equal(suggestion.family, 'Sin definir');
});
