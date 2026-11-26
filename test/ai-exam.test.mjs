import test from 'node:test';
import assert from 'node:assert/strict';
import { examView, learnable, summarize, weekOf } from '../lib/ai-exam.mjs';

test('Examen semanal: semana del lunes y resumen por tema', () => {
  assert.equal(weekOf('2026-11-26'), '2026-11-23');
  assert.equal(weekOf('2026-11-23'), '2026-11-23');
  const sum = summarize([{ intent: 'Rendimiento', verdict: 'correcta' }, { intent: 'Rendimiento', verdict: 'parcial' }, { intent: 'Tiempos', verdict: 'incorrecta' }, { intent: 'Tiempos', verdict: 'sin-dato' }]);
  assert.equal(sum.pct, 25);
  assert.equal(sum.useful, 50);
  assert.deepEqual(sum.byIntent.Tiempos, { total: 2, correcta: 0 });
});

test('Examen semanal: solo aprende si falló, el equipo repitió y no hay precios ni contradicciones', () => {
  const team = { text: 'Rinde 1 kg por m² a 1 mm.', uses: 3 };
  assert.equal(learnable({ verdict: 'correcta' }, team), null);
  assert.equal(learnable({ verdict: 'incorrecta' }, team), 'Rinde 1 kg por m² a 1 mm.');
  assert.equal(learnable({ verdict: 'sin-dato' }, { ...team, uses: 1 }), null);
  assert.equal(learnable({ verdict: 'incorrecta' }, { varied: true, conflict: true, examples: [] }), null);
  assert.equal(learnable({ verdict: 'incorrecta' }, { text: 'Sale $ 25.000', uses: 4 }), null);
});

test('Examen semanal: la vista lista las semanas y la última primero', () => {
  const view = examView({ weeks: [{ week: '2026-11-23', results: [{ id: 1, verdict: 'correcta', intent: 'Usos' }], learned: 2, usd: 0.1 }] });
  assert.equal(view.weeks[0].pct, 100);
  assert.equal(view.weeks[0].learned, 2);
  assert.equal(view.last.results.length, 1);
});

test('Examen semanal: una tanda completa con base y IA simuladas aprende lo que falló', async () => {
  const { examRun } = await import('../lib/ai-exam.mjs');
  const qs = [];
  for (let item = 1; item <= 3; item += 1) for (let n = 0; n < 4; n += 1) qs.push({ id: item * 10 + n, item_id: `MLA${item}`, question: '¿Cuánto rinde por m2?', answer: 'Rinde 1 kg por m² a 1 mm de espesor.' });
  const writes = [];
  const http = async (url, init = {}) => {
    const text = String(url);
    if (text.includes('api.anthropic.com')) {
      const body = JSON.parse(init.body);
      const judge = /juez|JUEZ|compar/i.test(body.system);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: judge ? 'VEREDICTO: incorrecta\nMOTIVO: no dio el dato' : 'No tengo ese dato.' }], usage: { input_tokens: 1000, output_tokens: 100 } }) };
    }
    if (init.method && init.method !== 'GET') { writes.push({ url: text, body: JSON.parse(init.body || 'null') }); return { ok: true, status: 201, json: async () => [], text: async () => '' }; }
    let rows = [];
    if (text.includes('/ml_questions')) rows = text.includes('offset=0') ? qs : [];
    else if (text.includes('/ml_items')) rows = text.includes('offset=0') || text.includes('id=in.') ? [{ id: 'MLA1', title: 'Resina epoxi 1 kg' }, { id: 'MLA2', title: 'Resina epoxi 3 kg' }, { id: 'MLA3', title: 'Resina epoxi 5 kg' }] : [];
    return { ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows) };
  };
  const env = { ANTHROPIC_API_KEY: 'x', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const result = await examRun(env, http, { count: 3, budgetMs: 20000 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.asked >= 1);
  assert.ok(writes.some((write) => write.url.includes('crm_system_status')));
});
