import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistantAi, buildMessages, ASSISTANT_MODEL } from '../lib/assistant-ai.mjs';
import { buildAiContext, detectIntent } from '../src/assistant-answer.mjs';

const env = { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'k' };
const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
const req = (body, auth = 'Bearer t') => ({ headers: { authorization: auth }, body: { action: 'assistant', ...body } });

function world({ email = 'brenda@grupopoliplast.com.ar', reply = json({ content: [{ type: 'text', text: 'Rinde 1 kg por m² a 1 mm.\nFuente: Mercado Libre' }], usage: { input_tokens: 900, output_tokens: 40 } }) } = {}) {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return json({ id: 'u1', email });
    if (url === 'https://api.anthropic.com/v1/messages') return reply;
    return json({}, 404);
  };
  return { http, calls };
}

test('todo el equipo puede preguntar; la clave no viaja al navegador', async () => {
  const { http, calls } = world();
  const result = await assistantAi(req({ question: '¿Cuánto rinde la epoxi?', context: 'Respuesta del equipo: 1 kg por m²' }), env, http);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.match(result.body.text, /1 kg por m²/);
  assert.equal(JSON.stringify(result.body).includes('"k"'), false);
  const sent = JSON.parse(calls.find((call) => call.url.includes('anthropic')).options.body);
  assert.equal(sent.model, ASSISTANT_MODEL);
  assert.match(sent.system, /la que más repetimos/);
  assert.match(sent.messages.at(-1).content, /CONTEXTO[\s\S]*1 kg por m²[\s\S]*PREGUNTA: ¿Cuánto rinde la epoxi\?/);
});

test('sin clave o sin crédito avisa y no rompe', async () => {
  assert.deepEqual((await assistantAi(req({ question: 'hola' }), { ...env, ANTHROPIC_API_KEY: '' }, world().http)).body, { ok: false, reason: 'sin-clave' });
  const noCredit = world({ reply: json({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }, 400) });
  assert.equal((await assistantAi(req({ question: 'hola' }), env, noCredit.http)).body.reason, 'sin-credito');
  const badKey = world({ reply: json({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401) });
  const rejected = (await assistantAi(req({ question: 'hola' }), env, badKey.http)).body;
  assert.equal(rejected.reason, 'clave');
  assert.equal(rejected.detail, 'invalid x-api-key');
  assert.equal((await assistantAi(req({ question: 'hola' }, ''), env, world().http)).status, 401);
  assert.equal((await assistantAi(req({ question: 'hola' }), env, world({ email: 'alguien@gmail.com' }).http)).status, 401);
});

test('la charla anterior viaja ordenada y empieza por el usuario', () => {
  const messages = buildMessages({ question: '¿y para 4 m²?', context: 'x', history: [{ role: 'assistant', text: 'hola' }, { role: 'user', text: '¿cuánto rinde?' }, { role: 'assistant', text: '1 kg por m²' }] });
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(messages[0].content, '¿cuánto rinde?');
  assert.match(messages[2].content, /PREGUNTA: ¿y para 4 m²\?/);
});

test('el contexto pone primero la respuesta del equipo', () => {
  const context = buildAiContext({
    intent: detectIntent('cuanto rinde'),
    team: { text: 'Se calcula 1 kilo x M2.', uses: 30, total: 40 },
    facts: [{ text: 'Rendimiento: 1 kg por m²', guide: 'PoxiPlast', validated: false }],
    result: { groups: { productos: [{ title: 'POXIPLAST 450GR', subtitle: 'RE-608', snippet: '' }] } },
    mlRows: [{ kind: 'pregunta', body: 'Pregunta: Cuanto rinde\nRespuesta: Hola ABC Se calcula 1 kilo x M2. Saludos Brenda' }],
  });
  const lines = context.split('\n');
  assert.equal(lines[0], 'Tema detectado: Rendimiento');
  assert.match(lines[1], /^Respuesta del equipo en Mercado Libre .*30 de 40.*Se calcula 1 kilo x M2\./);
  assert.match(context, /- P: Cuanto rinde \| R: Se calcula 1 kilo x M2\.$/m);
});
