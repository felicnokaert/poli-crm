import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogOffers, refreshCatalog } from '../lib/ml-catalog.mjs';
import { catalogContext, catalogView } from '../src/ml-catalog-view.mjs';
import { cronProblems, runIntegrationCron } from '../lib/integration-crons.mjs';
import { integrationsStatus, needsAttention } from '../src/integrations-status.mjs';
import { asksMlCompetition } from '../src/ml-competition-view.mjs';

test('catálogo: estado, precio para ganar y ofertas de otros vendedores', async () => {
  const saved = {};
  const store = { upsert: async (table, rows) => { saved[table] = [...(saved[table] || []), ...rows]; } };
  const get = async (path) => {
    if (path.startsWith('/items?ids=')) return [{ code: 200, body: { id: 'MLA1', title: 'Espuma', price: 12000, catalog_product_id: 'MLA900', seller_id: 9 } }, { code: 200, body: { id: 'MLA2', title: 'Sin catálogo', price: 1 } }];
    if (path.includes('/price_to_win')) return { status: 'competing', current_price: 12000, price_to_win: 10900, winner: { item_id: 'MLA77', price: 11000 } };
    if (path === '/products/MLA900') return { name: 'Espuma poliuretano 750', permalink: 'https://www.mercadolibre.com.ar/p/MLA900', buy_box_winner: { item_id: 'MLA77', price: 11000, seller_id: 5 } };
    if (path.startsWith('/products/MLA900/items')) return { results: [{ item_id: 'MLA1', seller_id: 9, price: 12000 }, { item_id: 'MLA77', seller_id: 5, price: 11000, shipping: { free_shipping: true } }, { item_id: 'MLA78', seller_id: 6, price: 11500 }] };
    if (path === '/users/5') return { nickname: 'RIVAL' };
    if (path === '/users/6') throw new Error('403');
    return null;
  };
  const result = await refreshCatalog({ seller_id: '9' }, ['MLA1', 'MLA2'], { get, token: 't', store, today: '2026-10-23', ownSellers: new Set(['9']) });
  assert.equal(result.done, 2);
  assert.equal(result.saved, 1);
  const [status] = saved.ml_catalog_status;
  assert.equal(status.status, 'competing');
  assert.equal(status.price_to_win, 10900);
  assert.equal(status.winner_nickname, 'RIVAL');
  assert.equal(status.winner_is_ours, false);
  assert.equal(status.others_count, 2);
  assert.equal(status.cheapest_price, 11000);
  assert.deepEqual(saved.ml_competitor_items.map((row) => row.id), ['MLA77', 'MLA78']);
  assert.equal(saved.ml_competitor_items[0].our_item_id, 'MLA1');
  assert.equal(saved.ml_competitor_items[0].added_by, 'catalogo');
  assert.equal(saved.ml_competitor_snapshots.length, 2);
  // Mismas columnas en todas las filas (la base lo pide en una tanda).
  const keys = saved.ml_competitor_items.map((row) => Object.keys(row).sort().join());
  assert.equal(new Set(keys).size, 1);

  const view = catalogView([status, { item_id: 'MLA3', seller_id: '9', product_name: 'Resina', status: 'winning', our_price: 5000 }], { nickname: { 9: 'POLIPLAST' } });
  assert.equal(view.counts.losing, 1);
  assert.equal(view.counts.winning, 1);
  assert.equal(view.rows[0].state.label, 'Perdemos');
  assert.equal(view.rows[0].cut.amount, 1100);
  assert.equal(view.rows[0].cut.pct, -9.2);
  assert.equal(view.rows[0].winner, 'RIVAL');
  assert.match(catalogContext(view), /perdemos 1/);
  assert.match(catalogContext(view), /precio para ganar \$ 10\.900/);
  assert.deepEqual(catalogOffers(null), []);
  assert.ok(asksMlCompetition('en que productos de catalogo de mercado libre perdemos'));
  assert.ok(!asksMlCompetition('que hay en el catalogo del cotizador'));
});

test('actualizaciones automáticas: constancia al empezar y al terminar, con los problemas', async () => {
  const writes = [];
  const fetchImpl = async (url, options) => { writes.push(JSON.parse(options.body)); return { ok: true, status: 201 }; };
  const env = { CRON_SECRET: 'c', SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  assert.equal((await runIntegrationCron('shopify', async () => ({ status: 200, body: {} }), { headers: {} }, env, fetchImpl)).status, 401);
  assert.equal(writes.length, 0);
  const job = async () => ({ status: 200, body: { ok: true, metrics: [{ nickname: 'COMARG', errors: ['visitas: Too many requests'] }] } });
  await runIntegrationCron('mercadolibre', job, { headers: { authorization: 'Bearer c' } }, env, fetchImpl);
  assert.equal(writes[0].key, 'integration:mercadolibre');
  assert.equal(writes[0].detail.running, true);
  assert.equal(writes[1].ok, true);
  assert.deepEqual(writes[1].detail.problems, ['COMARG: visitas: Too many requests']);
  await runIntegrationCron('contabilium', async () => { throw new Error('se cayó'); }, { headers: { authorization: 'Bearer c' } }, env, fetchImpl);
  assert.equal(writes[3].ok, false);
  assert.deepEqual(writes[3].detail.problems, ['se cayó']);
  assert.deepEqual(cronProblems({ results: [{ company: 'POLIPLAST', ok: false, error: 'token' }] }), ['POLIPLAST: token']);
});

test('actualizaciones automáticas: qué mostrar de cada una', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const list = integrationsStatus([
    { key: 'integration:mercadolibre-1', last_run_at: '2026-10-24T09:31:00Z', ok: true, detail: { problems: [] } },
    { key: 'integration:contabilium', last_run_at: '2026-10-24T10:00:00Z', ok: false, detail: { problems: ['token vencido'] } },
    { key: 'integration:shopify', last_run_at: '2026-10-24T10:30:00Z', ok: false, detail: { running: true } },
    { key: 'daily-maintenance', last_run_at: '2026-10-21T06:00:00Z', ok: true },
  ], { now });
  const state = Object.fromEntries(list.map((entry) => [entry.key, entry.state]));
  assert.equal(state['integration:mercadolibre-1'], 'ok');
  assert.equal(state['integration:contabilium'], 'failed');
  assert.equal(state['integration:shopify'], 'cut');
  assert.equal(state['daily-maintenance'], 'stale');
  assert.equal(state['integration:mercadolibre-mercado'], 'never');
  assert.deepEqual(needsAttention(list).map((entry) => entry.key).sort(), ['daily-maintenance', 'integration:contabilium', 'integration:shopify']);
});
