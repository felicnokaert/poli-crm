import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBoard, filterBoard, issuesOf, countQuestions } from '../src/ml-board.mjs';
import { dailyMercadoLibreRefresh, mercadoLibreCron, itemRow } from '../lib/mercadolibre.mjs';
import { testContabilium, contabiliumAdmin } from '../lib/contabilium.mjs';

const items = [
  { id: 'MLA1', seller_id: '1', title: 'Espuma poliuretano', status: 'active', sold_quantity: 10, available_quantity: 5, clips_count: 0, visits_30d: 50, pictures_count: 2, health: 0.5, description_length: 0, item_updated_at: 'x' },
  { id: 'MLA2', seller_id: '1', title: 'Máquina proyectora', status: 'paused', sold_quantity: 0, clips_count: 2, pictures_count: 6, description_length: 500, item_updated_at: 'x' },
  { id: 'MLA3', seller_id: '2', title: 'Resina', status: 'active', sold_quantity: 0, available_quantity: 0, clips_count: null, visits_30d: 300, pictures_count: null, description_length: 400, item_updated_at: null },
];

test('resumen por estado y faltas solo de las activas; sin clips revisados no cuenta como sin clip', () => {
  const summary = summarizeBoard(items);
  assert.equal(summary.total, 3);
  assert.equal(summary.byStatus.active, 2);
  assert.equal(summary.byStatus.paused, 1);
  assert.equal(summary.issues['sin-clip'], 1);
  assert.equal(summary.clipsUnknown, 1);
  assert.equal(summary.issues['visitas-sin-ventas'], 1);
  assert.equal(summary.issues['sin-stock'], 1);
  assert.equal(summary.missingDetail, 1);
  assert.deepEqual(issuesOf(items[0]).map((issue) => issue.key), ['sin-clip', 'pocas-fotos', 'sin-descripcion', 'calidad-baja']);
});

test('filtra por cuenta, estado, falta y palabras (sin acentos)', () => {
  assert.deepEqual(filterBoard(items, { seller: '1' }).map((item) => item.id), ['MLA1', 'MLA2']);
  assert.deepEqual(filterBoard(items, { status: 'active', issue: 'sin-stock' }).map((item) => item.id), ['MLA3']);
  assert.deepEqual(filterBoard(items, { query: 'maquina' }).map((item) => item.id), ['MLA2']);
  assert.deepEqual(filterBoard(items, { sort: 'visitas30' }).map((item) => item.id), ['MLA3', 'MLA1', 'MLA2']);
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

import { summarizeOrders, accountMetrics } from '../lib/mercadolibre.mjs';
import { combineMetrics, buildAlerts, latestBySeller } from '../src/ml-summary.mjs';

test('resumen de ventas: solo pagadas, unidades, por día (hora de Argentina) y lo más vendido, sin compradores', () => {
  const { sales, daily, topItems } = summarizeOrders([
    { status: 'paid', total_amount: 1000, currency_id: 'ARS', date_created: '2026-10-20T01:00:00.000-00:00', buyer: { nickname: 'COMPRADOR' }, order_items: [{ item: { id: 'MLA1', title: 'Espuma' }, quantity: 2, unit_price: 500 }] },
    { status: 'paid', total_amount: 300, date_created: '2026-10-20T15:00:00.000-00:00', order_items: [{ item: { id: 'MLA2', title: 'Resina' }, quantity: 1, unit_price: 300 }] },
    { status: 'cancelled', total_amount: 999, date_created: '2026-10-20T15:00:00.000-00:00' },
  ]);
  assert.deepEqual(sales, { orders: 2, units: 3, amount: 1300, cancelled: 1, currency: 'ARS' });
  assert.deepEqual(Object.keys(daily).sort(), ['2026-10-19', '2026-10-20']);
  assert.equal(topItems[0].id, 'MLA1');
  assert.ok(!JSON.stringify({ sales, daily, topItems }).includes('COMPRADOR'));
});

test('accountMetrics junta ventas, visitas, preguntas y reputación; si una parte falla, sigue con el resto', async () => {
  const now = () => Date.parse('2026-10-21T12:00:00Z');
  const http = async (url) => {
    if (url.includes('/orders/search')) return json({ message: 'At least one policy returned UNAUTHORIZED.' }, 403);
    if (url.includes('/items_visits')) return json({ total_visits: 200, results: [{ date: '2026-10-20T00:00:00Z', total: 50 }] });
    if (url.includes('status=UNANSWERED')) return json({ total: 4 });
    if (url.includes('/users/9')) return json({ seller_reputation: { level_id: '5_green', power_seller_status: 'platinum', metrics: { claims: { rate: 0.01 } } } });
    return json({}, 404);
  };
  const data = await accountMetrics({ seller_id: '9' }, 'T', http, { now });
  assert.equal(data.sales, null);
  assert.equal(data.visits, 50, 'suma de los últimos 30 días');
  assert.equal(data.questionsPending, 4);
  assert.equal(data.reputation.level, '5_green');
  assert.equal(data.days.length, 60);
  assert.equal(data.ordersBlocked, true);
  assert.match(data.errors[0], /^ventas/);
});

test('todas las cuentas suman y las alertas muestran la evidencia', () => {
  const a = { sales: { orders: 2, units: 3, amount: 100, cancelled: 0, currency: 'ARS' }, visits: 100, questionsPending: 1, days: [{ day: '2026-10-20', orders: 2, amount: 100, visits: 100 }], topItems: [{ id: 'A', amount: 100 }], reputation: { level: '3_yellow' } };
  const b = { sales: { orders: 1, units: 1, amount: 50, cancelled: 1, currency: 'ARS' }, visits: 100, questionsPending: 0, days: [{ day: '2026-10-20', orders: 1, amount: 50, visits: 20 }], topItems: [{ id: 'B', amount: 50 }] };
  const total = combineMetrics([a, b]);
  assert.equal(total.sales.amount, 150);
  assert.equal(total.conversion, 3 / 200);
  assert.equal(total.days[0].visits, 120);
  assert.deepEqual(latestBySeller([{ seller_id: '1', taken_on: '2026-10-20' }, { seller_id: '1', taken_on: '2026-10-21' }])['1'].taken_on, '2026-10-21');
  const alerts = buildAlerts({ metricsBySeller: { 1: a }, nickname: { 1: 'POLI' }, items: [{ id: 'X', status: 'active', available_quantity: 0, sold_quantity: 9, item_updated_at: 'x', clips_count: 0, visits_30d: 40, description_length: 100 }] });
  assert.deepEqual(alerts.map((alert) => alert.key), ['q-1', 'r-1', 'stock', 'clip']);
  assert.equal(buildAlerts({ metricsBySeller: { 1: { ordersBlocked: true } }, nickname: { 1: 'POLI' } })[0].key, 'permiso');
  assert.match(alerts[0].text, /POLI: 1 pregunta sin responder/);
});

import { periodStats, change } from '../src/ml-summary.mjs';
import { itemExtras, clipsCount } from '../lib/mercadolibre.mjs';

test('períodos: 7 días contra los 7 anteriores', () => {
  const days = Array.from({ length: 14 }, (_, index) => ({ day: `2026-10-${String(index + 8).padStart(2, '0')}`, orders: index < 7 ? 1 : 2, amount: index < 7 ? 100 : 300, units: 1, visits: 10 }));
  const { current, previous, series } = periodStats(days, 7);
  assert.equal(series.length, 7);
  assert.equal(current.amount, 2100);
  assert.equal(previous.amount, 700);
  assert.equal(change(current.amount, previous.amount), 2);
  assert.equal(current.conversion, 14 / 70);
  assert.equal(periodStats(days, 30).previous, null);
});

test('visitas de a una publicación, con reintento si Mercado Libre frena; los clips ya no se piden', async () => {
  assert.equal(clipsCount([{}, {}]), 2);
  assert.equal(clipsCount({ foo: 1 }), null);
  const saved = [];
  const calls = [];
  let throttled = false;
  const http = async (url) => {
    calls.push(url);
    if (url.includes('/items/MLA1/visits/time_window')) return json({ total_visits: 30, results: Array.from({ length: 30 }, (_, i) => ({ total: i >= 23 ? 1 : 0 })) });
    if (url.includes('/items/MLA2/visits/time_window')) {
      if (!throttled) { throttled = true; return json({ message: 'Too many requests' }, 429); }
      return json({ total_visits: 4, results: [] });
    }
    if (url.includes('/items/MLA3/visits/time_window')) return json({ message: 'Too many requests' }, 429);
    return json({}, 404);
  };
  const result = await itemExtras({ seller_id: '9' }, 'T', ['MLA1', 'MLA2', 'MLA3'], http, { upsert: async (table, rows) => saved.push(...rows) }, { now: () => Date.parse('2026-10-21T12:00:00Z'), pause: 0, wait: async () => {} });
  assert.equal(result.saved, 3);
  assert.deepEqual([saved[0].visits_7d, saved[0].visits_30d], [7, 30]);
  assert.equal(saved[1].visits_30d, 4);
  assert.equal(saved[2].visits_30d, null);
  assert.equal(calls.some((url) => url.includes('clips')), false);
  assert.deepEqual(result.errors, ['Mercado Libre frenó por muchos pedidos seguidos (1 publicación)']);
});
