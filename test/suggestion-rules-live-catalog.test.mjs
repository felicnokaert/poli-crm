import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuggestion } from '../src/suggestion-rules.mjs';

test('uses the live catalog (technical-documents-repo shape) when provided, instead of the static 31-doc index', () => {
  const liveDocs = [
    { id: 'live-1', family: 'Poliuretano', product: 'isoBUNKER 619-SP', docType: 'ficha_tecnica', sourceFile: 'x.pdf', status: 'inventariado' },
    { id: 'live-2', family: 'PURMAC', product: 'Airless 390', docType: 'manual', sourceFile: 'y.pdf', status: 'vigente' },
  ];
  const suggestion = buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano' }, { documents: liveDocs });
  assert.equal(suggestion.family, 'Poliuretano');
  assert.deepEqual(suggestion.recommendedDocs, [{
    id: 'live-1', product: 'isoBUNKER 619-SP', docType: 'ficha_tecnica', sourceFile: 'x.pdf', verified: false,
    status: 'inventariado', sourceUrl: undefined, verifiedBy: undefined, verifiedAt: undefined, extractedText: undefined,
    storagePath: undefined,
  }]);
});

test('maps status "vigente" to verified:true, everything else to false', () => {
  const liveDocs = [{ id: 'v1', family: 'PURMAC', product: 'Airless 390', docType: 'manual', sourceFile: 'y.pdf', status: 'vigente' }];
  const suggestion = buildSuggestion({ text_body: 'necesito una máquina purmac' }, { documents: liveDocs });
  assert.equal(suggestion.recommendedDocs[0].verified, true);
});

test('falls back to the static index when no documents option is given (backward compatible)', () => {
  const withoutOption = buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano' });
  assert.ok(withoutOption.recommendedDocs.length > 0);
});

test('an empty live catalog correctly yields no recommendations, not a fallback to the static one', () => {
  const suggestion = buildSuggestion({ text_body: 'necesito espuma rígida de poliuretano' }, { documents: [] });
  assert.deepEqual(suggestion.recommendedDocs, []);
});
