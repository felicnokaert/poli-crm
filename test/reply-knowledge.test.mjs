import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReplyKnowledge } from '../src/reply-knowledge.mjs';

const body = (q, a) => ({ kind: 'pregunta', body: `Pregunta: ${q}\nRespuesta: ${a}` });
function fakeSupabase({ rows = [], taught = [], rpcError = false } = {}) {
  return {
    rpc: async () => ({ data: rows, error: rpcError ? { message: 'x' } : null }),
    from: () => ({ select: async () => ({ data: taught }) }),
  };
}

test('respuesta sugerida: suma lo que más repetimos en Mercado Libre, lo enseñado y los precios', async () => {
  const supabase = fakeSupabase({
    rows: [body('cuanto rinde la epoxi', 'Rinde 1 kg por m2 a 1 mm.'), body('rendimiento epoxi', 'Rinde 1 kg por m2 a 1 mm.')],
    taught: [{ id: 1, question: 'cuanto rinde la epoxi', product: 'epoxi', answer: 'Un kilo cubre un metro cuadrado a un milimetro.' }],
  });
  const text = await loadReplyKnowledge(supabase, 'Hola, cuánto rinde la epoxi? y cuánto sale?', {
    today: '2026-10-29',
    loadPrices: async () => [{ variant: { sku: 'RE-1', name: 'Epoxi 1 kg' }, rows: [{ list: 'Lista consumidor final', from: 1, to: null, gross: 30000, net: 24793.4, vat: 21, currency: 'ARS' }] }],
  });
  assert.match(text, /Rinde 1 kg por m2/i);
  assert.match(text, /Respuestas validadas por Felipe/);
  assert.match(text, /Epoxi 1 kg/);
});

test('respuesta sugerida: si falla Mercado Libre o los precios, sigue sin eso y no rompe', async () => {
  const supabase = fakeSupabase({ rpcError: true });
  const text = await loadReplyKnowledge(supabase, 'Cuánto sale la epoxi?', { today: '2026-10-29', loadPrices: async () => { throw new Error('caído'); } });
  assert.equal(typeof text, 'string');
  assert.equal(await loadReplyKnowledge(null, 'hola'), '');
  assert.equal(await loadReplyKnowledge(supabase, ''), '');
});
