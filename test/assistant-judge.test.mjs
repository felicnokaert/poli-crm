import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgeMessages, parseVerdict, assistantAi } from '../lib/assistant-ai.mjs';
import { appendEvalHistory, evalSummary } from '../src/assistant-training.mjs';

test('el juez recibe la pregunta, la respuesta real y la de la IA', () => {
  const [message] = buildJudgeMessages({ question: '¿Cuánto rinde?', realAnswer: '1 kg por m²', aiAnswer: 'Rinde 1 kg/m².' });
  assert.equal(message.role, 'user');
  assert.match(message.content, /¿Cuánto rinde\?/);
  assert.match(message.content, /RESPUESTA REAL DEL EQUIPO:\n1 kg por m²/);
  assert.match(message.content, /RESPUESTA DE LA IA:\nRinde 1 kg\/m²\./);
});

test('parseVerdict lee el JSON aunque venga con texto alrededor y cae en parcial si no entiende', () => {
  assert.deepEqual(parseVerdict('{"veredicto":"correcta","motivo":"Mismo rendimiento"}'), { verdict: 'correcta', reason: 'Mismo rendimiento' });
  assert.equal(parseVerdict('Claro: ```json\n{"veredicto": "Incorrecta", "motivo": "Da 2 kg"}\n```').verdict, 'incorrecta');
  assert.equal(parseVerdict('{"veredicto":"sin-dato","motivo":"No sabe"}').verdict, 'sin-dato');
  assert.equal(parseVerdict('no sé qué decir').verdict, 'parcial');
  assert.equal(parseVerdict('{roto').verdict, 'parcial');
});

test('evalSummary: porcentajes y temas, de peor a mejor', () => {
  const results = [
    { intent: { label: 'Rendimiento' }, verdict: 'correcta' }, { intent: { label: 'Rendimiento' }, verdict: 'incorrecta' },
    { intent: { label: 'Tiempos' }, verdict: 'correcta' }, { intent: { label: 'Tiempos' }, verdict: 'parcial' }, { intent: { label: 'Envíos' }, verdict: 'sin-dato' }, {},
  ];
  const s = evalSummary(results);
  assert.equal(s.total, 5);
  assert.equal(s.pct, 40);
  assert.equal(s.pctServe, 60);
  assert.equal(s.sinDato, 1);
  assert.equal(s.byIntent[0].label, 'Envíos');
  assert.deepEqual(evalSummary([]), { total: 0, correcta: 0, parcial: 0, incorrecta: 0, sinDato: 0, pct: 0, pctServe: 0, byIntent: [] });
});

test('el historial guarda las últimas 20 tandas y no suma tandas vacías', () => {
  let history = [];
  for (let i = 0; i < 25; i += 1) history = appendEvalHistory(history, { total: 10, pct: i, pctServe: i, incorrecta: 1, sinDato: 0 }, { now: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, tokens: 1000 });
  assert.equal(history.length, 20);
  assert.equal(history[0].pct, 24);
  assert.deepEqual(appendEvalHistory(history, { total: 0 }), history);
});

test('modo juez en el servidor: manda el prompt del juez y devuelve veredicto y uso', async () => {
  let sent;
  const http = async (url, options = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u', email: 'felipe@grupopoliplast.com.ar' }) };
    sent = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"veredicto":"parcial","motivo":"Falta el tiempo"}' }], usage: { input_tokens: 300, output_tokens: 20 } }) };
  };
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'k', ASSISTANT_JUDGE_MODEL: 'modelo-juez' };
  const result = await assistantAi({ headers: { authorization: 'Bearer t' }, body: { mode: 'juez', question: 'Pregunta', realAnswer: 'Real', aiAnswer: 'IA' } }, env, http);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.verdict, 'parcial');
  assert.equal(result.body.usage.input, 300);
  assert.equal(sent.model, 'modelo-juez');
  assert.equal(sent.max_tokens, 600);
  assert.equal(sent.tools, undefined);
  assert.match(sent.system, /corrector de respuestas/);
});

import { listingContext, buildAiContext as buildCtx } from '../src/assistant-answer.mjs';
test('listingContext arma la ficha sin links ni mails y buildAiContext la incluye', () => {
  const text = listingContext({ title: 'Mica 100 g', description: 'Colores sueltos. Escribinos a ventas@x.com o https://x.com/a', attributes: [{ name: 'Color', value_name: 'Rojo' }, { name: 'GTIN', value_name: '123' }] });
  assert.match(text, /Color: Rojo/);
  assert.doesNotMatch(text, /GTIN|ventas@|https/);
  assert.match(buildCtx({ listing: text }), /Ficha de la publicación/);
  assert.equal(listingContext({}), '');
});

import { familySiblings, trainingContext } from '../src/assistant-training.mjs';
import { CUSTOMER_PROMPT } from '../lib/assistant-ai.mjs';
test('familySiblings trae respuestas de otras publicaciones de la misma familia y trainingContext las rotula', () => {
  const titles = { A: 'Poxiplast Resina 150 g', B: 'Poxiplast Resina 3 Kg', C: 'Penosil Espuma' };
  const questions = [
    { id: 1, item_id: 'A', question: 'cuantos metros cubre', answer: '' },
    { id: 2, item_id: 'B', question: 'cuantos metros cubre', answer: 'Para pintada de protección 200 gramos x m2.' },
    { id: 3, item_id: 'C', question: 'cuantos metros cubre', answer: 'otra cosa' },
  ];
  const family = familySiblings({ id: 1, item_id: 'A', question: 'cuantos metros cubre' }, questions, titles);
  assert.deepEqual(family.map((row) => row.id), [2]);
  const { context } = trainingContext({ id: 1, item_id: 'A', question: 'cuantos metros cubre', title: titles.A }, [], { family });
  assert.match(context, /Otra publicación de la familia/);
  assert.match(context, /200 gramos/);
});
test('el perfil cliente no deja inventar ni hablar como interno', () => {
  assert.match(CUSTOMER_PROMPT, /DERIVAR/);
  assert.match(CUSTOMER_PROMPT, /NUNCA inventes/);
});

import { customerParts } from '../lib/assistant-ai.mjs';
test('customerParts saca las marcas de derivar y adjuntar', () => {
  const out = customerParts('Lo consulto con el equipo y te respondo en breve.\n[DERIVAR: Brenda]\n[ADJUNTAR: Ficha EasySpray]');
  assert.equal(out.derive, 'Brenda');
  assert.deepEqual(out.attach, ['Ficha EasySpray']);
  assert.doesNotMatch(out.draft, /DERIVAR|ADJUNTAR/);
});

test('si Anthropic contesta vacío, reintenta una vez y usa la segunda respuesta', async () => {
  let calls = 0;
  const http = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u', email: 'felipe@grupopoliplast.com.ar' }) };
    calls += 1;
    return { ok: true, status: 200, json: async () => (calls === 1 ? { content: [], stop_reason: 'end_turn' } : { content: [{ type: 'text', text: 'Hola, ¿para qué superficie la necesitás?' }], usage: { input_tokens: 5, output_tokens: 5 } }) };
  };
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'k' };
  const result = await assistantAi({ headers: { authorization: 'Bearer t' }, body: { mode: 'cliente', question: 'cuanto rinde?', context: '' } }, env, http);
  assert.equal(result.body.ok, true);
  assert.match(result.body.draft, /superficie/);
  assert.equal(calls, 2);
});

test('customerParts nunca deja el borrador vacío si solo vino la marca de derivar', () => {
  const out = customerParts('[DERIVAR: Ezequiel]');
  assert.equal(out.derive, 'Ezequiel');
  assert.match(out.draft, /consulto con el equipo/);
});
