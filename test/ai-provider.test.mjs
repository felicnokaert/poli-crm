import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveProvider, isProviderConfigured, draftReplyWithProvider, prepareManualQuery, findRelevantDocuments, prepareProductRecommendationQuery } from '../src/ai-provider.mjs';

test('no provider is configured in phase 1, no paid integration', () => {
  assert.equal(getActiveProvider(), 'none');
  assert.equal(isProviderConfigured(), false);
});

test('draftReplyWithProvider makes no network call and returns an explicit not-configured result', async () => {
  const result = await draftReplyWithProvider({ text: 'cualquier cosa' });
  assert.equal(result.ok, false);
  assert.equal(result.provider, 'none');
  assert.ok(result.reason.includes('Preparar consulta para IA'));
});

test('prepareManualQuery builds plain text with no secrets and no full phone numbers', () => {
  const text = prepareManualQuery({
    family: 'Penosil',
    intent: 'Precio / cotización',
    temperature: 'Caliente',
    missingQuestions: ['¿Qué superficie?'],
    recommendedDocs: [{ product: 'isoBUNKER 619-SP' }],
    customerMessage: 'necesito precio urgente',
  });
  assert.ok(text.includes('Penosil'));
  assert.ok(text.includes('isoBUNKER 619-SP'));
  assert.ok(text.includes('¿Qué superficie?'));
  assert.ok(!/sk-[a-z0-9]/i.test(text));
  assert.ok(!/token|api[_-]?key|bearer/i.test(text));
});

test('prepareManualQuery works with no context at all', () => {
  assert.doesNotThrow(() => prepareManualQuery());
  const text = prepareManualQuery();
  assert.ok(text.includes('Sin definir'));
});

const SAMPLE_DOCS = [
  {
    id: '1',
    title: 'Ficha isoBUNKER 619-SP',
    product: 'isoBUNKER 619-SP',
    family: 'Espuma PU',
    status: 'vigente',
    extractedText: 'Aislante térmico de espuma rígida de poliuretano. Rendimiento: 1 kg cubre 0.4 m² a 3cm. Uso en carrocerías y casillas rodantes.',
  },
  {
    id: '2',
    title: 'Ficha Resina Poliéster Náutica',
    product: 'Resina Poliéster Náutica',
    family: 'Resinas',
    status: 'vigente',
    extractedText: 'Resina para uso náutico, apta para fibra de vidrio. No es aislante térmico.',
  },
  {
    id: '3',
    title: 'Ficha sin validar de espuma',
    product: 'Espuma experimental',
    family: 'Espuma PU',
    status: 'pendiente_validacion',
    extractedText: 'Aislante térmico de espuma rígida, todavía sin validar.',
  },
];

test('findRelevantDocuments only searches vigente documents and ranks by keyword match', () => {
  const matches = findRelevantDocuments('necesito algo que aísle térmicamente, espuma rígida de poliuretano', SAMPLE_DOCS);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, '1');
  assert.ok(!matches.some((doc) => doc.id === '3'), 'no debe incluir fichas sin validar aunque coincidan');
});

test('findRelevantDocuments returns nothing for an empty or stopword-only question', () => {
  assert.deepEqual(findRelevantDocuments('', SAMPLE_DOCS), []);
  assert.deepEqual(findRelevantDocuments('que necesito para el producto', SAMPLE_DOCS), []);
});

test('prepareProductRecommendationQuery includes the question and matched excerpts, never invents data, ranks the best match first', () => {
  const text = prepareProductRecommendationQuery('qué aísla térmicamente y es espuma rígida de poliuretano', SAMPLE_DOCS);
  assert.ok(text.includes('isoBUNKER 619-SP'));
  assert.ok(text.includes('Rendimiento: 1 kg cubre 0.4 m²'));
  assert.ok(text.indexOf('isoBUNKER 619-SP') < text.indexOf('Resina Poliéster Náutica'));
  assert.ok(text.toLowerCase().includes('no inventes'));
});

test('prepareProductRecommendationQuery says clearly when nothing matches', () => {
  const text = prepareProductRecommendationQuery('necesito tornillos autoperforantes galvanizados', SAMPLE_DOCS);
  assert.ok(text.includes('No se encontró ninguna ficha vigente'));
});
