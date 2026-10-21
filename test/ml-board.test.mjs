import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBoard, filterBoard, issuesOf, countQuestions } from '../src/ml-board.mjs';
import { dailyMercadoLibreRefresh, mercadoLibreCron, itemRow } from '../lib/mercadolibre.mjs';
import { testContabilium, contabiliumAdmin } from '../lib/contabilium.mjs';

const items = [
  { id: 'MLA1', seller_id: '1', title: 'Espuma poliuretano', status: 'active', sold_quantity: 10, available_quantity: 5, video_id: null, pictures_count: 2, health: 0.5, description_length: 0, item_updated_at: 'x' },
  { id: 'MLA2', seller_id: '1', title: 'Máquina proyectora', status: 'paused', sold_quantity: 0, video_id: 'v', pictures_count: 6, description_length: 500, item_updated_at: 'x' },
  { id: 'MLA3', seller_id: '2', title: 'Resina', status: 'active', sold_quantity: 0, available_quantity: 0, video_id: null, pictures_count: null, description_length: 400, item_updated_at: null },
];

test('resumen por estado y faltas solo de las activas; sin datos nuevos no cuenta como sin video', () => {
  const summary = summarizeBoard(items);
  assert.equal(summary.total, 3);
  assert.equal(summary.byStatus.active, 2);
  assert.equal(summary.byStatus.paused, 1);
  assert.equal(summary.issues['sin-video'], 1);
  assert.equal(summary.issues['sin-stock'], 1);
  assert.equal(summary.missingDetail, 1);
  assert.deepEqual(issuesOf(items[0]).map((issue) => issue.key), ['sin-video', 'pocas-fotos', 'sin-descripcion', 'calidad-baja']);
});

test('filtra por cuenta, estado, falta y palabras (sin acentos)', () => {
  assert.deepEqual(filterBoard(items, { seller: '1' }).map((item) => item.id), ['MLA1', 'MLA2']);
  assert.deepEqual(filterBoard(items, { status: 'active', issue: 'sin-stock' }).map((item) => item.id), ['MLA3']);
  assert.deepEqual(filterBoard(items, { query: 'maquina' }).map((item) => item.id), ['MLA2']);
  assert.deepEqual(countQuestions([{ item_id: 'MLA1' }, { item_id: 'MLA1' }, { item_id: '' }]), { MLA1: 2 });
});

test('itemRow sin descripción no la pisa; con datos nuevos guarda video, fotos y calidad', () => {
  const row = itemRow({ id: 'A', video_id: 'v1', pictures: [{}, {}], health: 0.8, last_updated: 'z' }, 9);
  assert.equal('description' in row, false);
  assert.equal(row.video_id, 'v1');
  assert.equal(row.pictures_count, 2);
  assert.equal(itemRow({ id: 'A' }, 9, '').description, '');
});

const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

test('actualización diaria: preguntas nuevas, refresca las conocidas sin descripción y trae completas las nuevas', async () => {
  const saved = [];
  const http = async (url, options = {}) => {
    if (url.includes('/rest/v1/ml_accounts?select=*')) return json([{ seller_id: '9', nickname: 'POLI', access_token: 'AT', expires_at: '2999-01-01' }]);
    if (url.includes('/rest/v1/ml_questions?select=id')) return json([{ id: '2' }]);
    if (url.includes('/rest/v1/ml_items?select=id')) return json([{ id: 'MLA1' }]);
    if (options.method === 'POST' && url.includes('/rest/v1/')) { saved.push({ table: url.split('/rest/v1/')[1], rows: JSON.parse(options.body) }); return json(null, 201); }
    if (options.method === 'PATCH') return json(null, 204);
    if (url.includes('/questions/search')) return json({ questions: [{ id: 1, text: 'nueva', answer: { text: 'sí' } }, { id: 2, text: 'vieja', answer: { text: 'sí' } }] });
    if (url.includes('/items/search') && url.includes('scroll_id')) return json({ results: [] });
    if (url.includes('/items/search')) return json({ results: ['MLA1', 'MLA9'], scroll_id: 'S' });
    if (url.includes('/items?ids=')) return json([{ code: 200, body: { id: 'MLA1', title: 'a', status: 'paused' } }, { code: 200, body: { id: 'MLA9', title: 'b' } }]);
    if (url.includes('/description')) return json({ plain_text: 'desc' });
    return json({}, 404);
  };
  const [result] = await dailyMercadoLibreRefresh({ SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 's' }, http);
  assert.deepEqual({ newQuestions: result.newQuestions, refreshed: result.refreshed, newItems: result.newItems, complete: result.complete }, { newQuestions: 1, refreshed: 1, newItems: 1, complete: true });
  const itemBatches = saved.filter((batch) => batch.table === 'ml_items' && batch.rows.length);
  assert.equal('description' in itemBatches[0].rows[0], false);
  assert.equal(itemBatches[1].rows[0].description, 'desc');
});

test('el cron pide la clave secreta', async () => {
  assert.equal((await mercadoLibreCron({ headers: {} }, { CRON_SECRET: 'c' })).status, 401);
  assert.equal((await mercadoLibreCron({ headers: { authorization: 'Bearer c' } }, { CRON_SECRET: 'c' })).body.skipped, 'sin claves de Mercado Libre');
});

test('Contabilium: prueba cada empresa sin exponer las claves', async () => {
  const env = { CONTABILIUM_POLIPLAST_CLIENT_ID: 'id1', CONTABILIUM_POLIPLAST_CLIENT_SECRET: 'sec1', CONTABILIUM_COMARG_CLIENT_ID: 'id2', CONTABILIUM_COMARG_CLIENT_SECRET: 'malo' };
  const http = async (url, options = {}) => {
    if (url.endsWith('/token')) return String(options.body).includes('malo') ? json({ error: 'invalid_client' }, 400) : json({ access_token: 'T' });
    if (url.includes('/api/clientes/search')) return json({ Items: [{}], TotalItems: 120 });
    if (url.includes('/api/conceptos/search')) return json({ Items: [], TotalItems: 45 });
    return json({}, 404);
  };
  const [poli, comarg, foam] = await testContabilium(env, http);
  assert.deepEqual([poli.ok, poli.clientes, poli.productos], [true, 120, 45]);
  assert.equal(comarg.ok, false);
  assert.match(comarg.error, /invalid_client/);
  assert.equal(foam.error, 'faltan las claves en Vercel');
  assert.ok(!JSON.stringify([poli, comarg, foam]).includes('sec1'));
  const denied = await contabiliumAdmin({ headers: { authorization: 'Bearer t' }, body: { op: 'test' } }, { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 's' }, async () => json({ id: 'u', email: 'juan@grupopoliplast.com.ar' }));
  assert.equal(denied.status, 403);
});
