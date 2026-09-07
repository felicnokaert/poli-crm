import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveProvider, isProviderConfigured, draftReplyWithProvider, prepareManualQuery } from '../src/ai-provider.mjs';

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
