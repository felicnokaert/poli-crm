import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mercadoLibreAdmin, itemRow, questionRow } from '../lib/mercadolibre.mjs';
import { withMercadoLibre, searchKnowledge } from '../src/knowledge-search.mjs';

const env = { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'svc', ML_CLIENT_ID: '123', ML_CLIENT_SECRET: 'sec' };
const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

function fakeWorld({ email = 'felipe@grupopoliplast.com.ar', account = null } = {}) {
  const calls = [];
  const saved = { ml_accounts: [], ml_items: [], ml_questions: [], patches: [] };
  const http = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return json({ id: 'u1', email });
    if (url.startsWith('https://db/rest/v1/ml_accounts?select=*')) return json(account ? [account] : []);
    if (url.startsWith('https://db/rest/v1/ml_accounts?select=seller_id')) return json([{ seller_id: '9', nickname: 'POLIPLAST' }]);
    if (url.startsWith('https://db/rest/v1/') && options.method === 'POST') { const table = url.split('/rest/v1/')[1]; saved[table].push(...JSON.parse(options.body)); return json(null, 201); }
    if (url.startsWith('https://db/rest/v1/') && options.method === 'PATCH') { saved.patches.push(JSON.parse(options.body)); return json(null, 204); }
    if (url.endsWith('/oauth/token')) return json({ access_token: 'AT', refresh_token: 'RT2', user_id: 9, expires_in: 21600 });
    if (url.endsWith('/users/me')) return json({ id: 9, nickname: 'POLIPLAST' });
    if (url.includes('/users/9/items/search')) return json({ results: ['MLA1', 'MLA2'], paging: { total: 2 } });
    if (url.includes('/items?ids=')) return json([{ code: 200, body: { id: 'MLA1', title: 'Espuma poliuretano', price: 100, attributes: [{ name: 'Marca', value_name: 'Poliplast' }, { name: 'Vacío' }] } }, { code: 404 }]);
    if (url.includes('/description')) return json({ plain_text: 'Para techos' });
    if (url.includes('/questions/search')) return json({ total: 2, questions: [{ id: 1, item_id: 'MLA1', text: '¿Sirve para techo?', from: { id: 555 }, answer: { text: 'Sí, hola.', date_created: 'x' } }, { id: 2, text: 'sin respuesta' }] });
    return json({ error: 'no' }, 404);
  };
  return { http, calls, saved };
}
const req = (body) => ({ headers: { authorization: 'Bearer t' }, body: { action: 'mercadolibre', ...body } });

test('solo Felipe y con las claves cargadas', async () => {
  assert.equal((await mercadoLibreAdmin(req({ op: 'accounts' }), env, fakeWorld({ email: 'juan@grupopoliplast.com.ar' }).http)).status, 403);
  assert.equal((await mercadoLibreAdmin(req({ op: 'accounts' }), { ...env, ML_CLIENT_SECRET: '' }, fakeWorld().http)).status, 400);
});

test('arma el link de autorización y conecta la cuenta guardando los tokens en el servidor', async () => {
  const world = fakeWorld();
  const link = await mercadoLibreAdmin(req({ op: 'authUrl', state: 'ml-x' }), env, world.http);
  assert.match(link.body.url, /client_id=123&redirect_uri=https%3A%2F%2Fpoli-crm\.vercel\.app%2F&state=ml-x/);
  assert.doesNotMatch(link.body.url, /sec/);
  assert.equal((await mercadoLibreAdmin(req({ op: 'exchange', code: 'malo' }), env, world.http)).status, 400);
  const done = await mercadoLibreAdmin(req({ op: 'exchange', code: 'TG-abc-9' }), env, world.http);
  assert.equal(done.body.nickname, 'POLIPLAST');
  assert.equal(world.saved.ml_accounts[0].refresh_token, 'RT2');
  assert.ok(!JSON.stringify(done.body).includes('AT'));
});

test('sincroniza publicaciones y solo preguntas respondidas, sin quién preguntó; renueva el token vencido', async () => {
  const world = fakeWorld({ account: { seller_id: '9', refresh_token: 'RT1', access_token: 'old', expires_at: '2000-01-01' } });
  const items = await mercadoLibreAdmin(req({ op: 'sync', sellerId: '9', stage: 'items', offset: 0 }), env, world.http);
  assert.equal(items.body.saved, 1);
  assert.equal(items.body.done, true);
  assert.equal(world.saved.patches[0].refresh_token, 'RT2');
  assert.deepEqual(world.saved.ml_items[0].attributes, [{ name: 'Marca', value: 'Poliplast' }]);
  assert.equal(world.saved.ml_items[0].description, 'Para techos');
  const questions = await mercadoLibreAdmin(req({ op: 'sync', sellerId: '9', stage: 'questions', offset: 0 }), env, world.http);
  assert.equal(questions.body.saved, 1);
  assert.ok(!JSON.stringify(world.saved.ml_questions).includes('555'));
  assert.ok(world.saved.patches.some((patch) => patch.last_sync_at));
  assert.ok(world.calls.every((call) => !/\/answers|method":"POST".*api\.mercadolibre\.com\/(items|questions)/.test(call.url)), 'nunca escribe en Mercado Libre');
  assert.ok(world.calls.filter((call) => call.url.startsWith('https://api.mercadolibre.com') && call.options.method === 'POST').every((call) => call.url.endsWith('/oauth/token')));
});

test('filas y resultados para Academia', () => {
  assert.equal(questionRow({ id: 1, text: 'hola' }, '9'), null);
  assert.equal(itemRow({ id: 'A', title: 'x' }, 9).seller_id, '9');
  const base = searchKnowledge('techo', {});
  const merged = withMercadoLibre(base, [{ kind: 'pregunta', id: '1', title: 'Espuma', body: 'Pregunta: ¿techo?\nRespuesta: sí', permalink: 'https://ml/1' }]);
  assert.equal(merged.total, 1);
  assert.equal(merged.groups.mercadolibre[0].url, 'https://ml/1');
});
