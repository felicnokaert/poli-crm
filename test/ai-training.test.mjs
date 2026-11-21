import test from 'node:test';
import assert from 'node:assert/strict';
import { canRun, costOf, parseDocQa, trainingRun, TRAINER } from '../lib/ai-training.mjs';
import { buildAiContext } from '../src/assistant-answer.mjs';

test('frena: apagado, pausa global, fecha límite, tope diario y sin clave', () => {
  const on = { enabled: true, until: '2026-11-25', dailyBudget: 20, days: {} };
  assert.equal(canRun(on, { today: '2026-11-21' }), '');
  assert.equal(canRun({ ...on, enabled: false }, { today: '2026-11-21' }), 'apagado');
  assert.equal(canRun(on, { today: '2026-11-21', paused: true }), 'pausa-global');
  assert.equal(canRun(on, { today: '2026-11-26' }), 'terminado');
  assert.equal(canRun({ ...on, days: { '2026-11-21': 20 } }, { today: '2026-11-21' }), 'tope-diario');
  assert.equal(canRun(on, { today: '2026-11-21', hasKey: false }), 'falta-clave');
});

test('costo de Opus 5.5 y lectura de las preguntas de una ficha', () => {
  assert.equal(costOf({ input_tokens: 1e6, output_tokens: 1e6 }), 24);
  const qa = parseDocQa('ok {"producto":"770-IR","items":[{"pregunta":"¿Cuál es la relación de mezcla?","respuesta":"100 : 110 en peso. https://x.com"},{"pregunta":"x","respuesta":""}]}');
  assert.equal(qa.product, '770-IR');
  assert.deepEqual(qa.items, [{ question: '¿Cuál es la relación de mezcla?', answer: '100 : 110 en peso.' }]);
  assert.deepEqual(parseDocQa('nada'), { product: '', items: [] });
});

test('lo aprendido solo va aparte de lo validado por Felipe', () => {
  const text = buildAiContext({ taught: [{ question: 'Rinde', product: 'PU-46', answer: '40 L' }, { question: 'Mezcla', product: '770', answer: '100:110', created_by_email: TRAINER }] });
  assert.match(text, /validadas por Felipe[^\n]*\n- P: Rinde/);
  assert.match(text, /Aprendido solo[^\n]*\n- P: Mezcla/);
});

function fakeEnv({ state, questions = [], items = [], docs = [], aiText }) {
  const inserted = [];
  const saved = [];
  let aiCalls = 0;
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
  const http = async (url, options = {}) => {
    if (String(url).includes('api.anthropic.com')) { aiCalls += 1; return json({ content: [{ type: 'text', text: aiText(JSON.parse(options.body)) }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 } }); }
    const path = String(url).split('/rest/v1/')[1] || '';
    if (options.method === 'POST' && path.startsWith('assistant_knowledge')) { inserted.push(...JSON.parse(options.body)); return json(null, 201); }
    if (options.method === 'POST' && path.startsWith('crm_system_status')) { saved.push(JSON.parse(options.body)[0]); return json(null, 201); }
    if (path.startsWith('crm_system_status')) return json(path.includes('ai-training') ? [{ detail: state }] : []);
    if (path.startsWith('ml_questions')) return json(path.includes('offset=0') ? questions : []);
    if (path.startsWith('ml_items')) return json(path.includes('offset=0') ? items : []);
    if (path.startsWith('assistant_knowledge')) return json([]);
    if (path.startsWith('technical_documents')) return json(docs);
    return json([]);
  };
  return { http, inserted, saved, calls: () => aiCalls, environment: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', ANTHROPIC_API_KEY: 'a' } };
}

test('una tanda: guarda lo repetido sin IA, lee las fichas con IA y anota lo gastado', async () => {
  const questions = [1, 2, 3].map((n) => ({ item_id: 'MLA1', question: `¿Cuánto rinde? ${n}`, answer: 'Rinde 40 litros por pomo.' }));
  const docs = [{ id: 'd1', title: 'Ficha 770-IR', product: '770-IR', extracted_text: 'Relación de mezcla 100 : 110 en peso. '.repeat(20) }];
  const fake = fakeEnv({
    state: { enabled: true, until: '2099-12-31', dailyBudget: 20, days: {} },
    questions, items: [{ id: 'MLA1', title: 'Espuma Poliuretano PU-46 Easyspray 750ml' }], docs,
    aiText: () => '{"producto":"770-IR","items":[{"pregunta":"¿Cuál es la relación de mezcla del 770-IR?","respuesta":"100 : 110 en peso."}]}',
  });
  const result = await trainingRun(fake.environment, fake.http, { budgetMs: 45000 });
  assert.equal(result.ok, true);
  assert.equal(fake.calls(), 1, 'una ficha = una llamada');
  assert.ok(fake.inserted.some((row) => /40 litros/.test(row.answer)), 'lo repetido 3 veces se guarda');
  assert.ok(fake.inserted.some((row) => row.product === '770-IR' && /100 : 110/.test(row.answer)));
  assert.ok(fake.inserted.every((row) => row.created_by_email === TRAINER));
  const last = fake.saved.at(-1).detail;
  assert.deepEqual(last.docsDone, ['d1']);
  assert.ok(Object.values(last.days)[0] > 0);
});

test('apagado no gasta nada', async () => {
  const fake = fakeEnv({ state: { enabled: false }, aiText: () => '' });
  const result = await trainingRun(fake.environment, fake.http);
  assert.equal(result.skipped, 'apagado');
  assert.equal(fake.calls(), 0);
});
