import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competitorIds, refreshCompetitors, refreshTrends } from '../lib/ml-competition.mjs';
import { asksMlCompetition, competitionContext, competitionRows, competitorSummary, trendsView } from '../src/ml-competition-view.mjs';

test('competencia: reconoce links y códigos, y separa los de catálogo', () => {
  const { ids, products } = competitorIds('https://articulo.mercadolibre.com.ar/MLA-1234567890-espuma-poliuretano _JM\nMLA987654321\nhttps://www.mercadolibre.com.ar/espuma/p/MLA55555555');
  assert.deepEqual(ids, ['MLA1234567890', 'MLA987654321']);
  assert.deepEqual(products, ['MLA55555555']);
});

test('competencia: guarda el estado de hoy y la foto diaria', async () => {
  const saved = {};
  const store = { upsert: async (table, rows) => { saved[table] = rows; } };
  const get = async (path) => {
    if (path.startsWith('/items?')) return [{ code: 200, body: { id: 'MLA1', title: 'Espuma rival', price: 9000, sold_quantity: 500, seller_id: 77, permalink: 'https://x', shipping: { free_shipping: true } } }, { code: 404, body: { id: 'MLA2' } }];
    if (path.startsWith('/users/')) return { nickname: 'RIVAL SA' };
    throw new Error('no');
  };
  const result = await refreshCompetitors(['MLA1', 'MLA2'], { get, token: 't', store, today: '2026-10-23', extra: { competitor_name: 'Alkanos' } });
  assert.equal(result.saved, 1);
  assert.deepEqual(result.missing, ['MLA2']);
  assert.equal(saved.ml_competitor_items[0].seller_nickname, 'RIVAL SA');
  assert.equal(saved.ml_competitor_items[0].competitor_name, 'Alkanos');
  assert.equal(saved.ml_competitor_items[0].free_shipping, true);
  assert.deepEqual(saved.ml_competitor_snapshots[0], { item_id: 'MLA1', taken_on: '2026-10-23', price: 9000, sold_quantity: 500, available_quantity: null, status: '' });
  const trends = await refreshTrends(['MLA1234'], { get: async (path) => (path.startsWith('/trends') ? [{ keyword: 'espuma poliuretano', url: 'u' }] : { name: 'Aislantes', path_from_root: [{ name: 'Construcción' }, { name: 'Aislantes' }] }), token: 't', store, today: '2026-10-23' });
  assert.equal(trends.saved, 1);
  assert.equal(saved.ml_trends[0].path, 'Construcción > Aislantes');
});

test('competencia: precio y vendidas contra hace 7 y 30 días, y contra la nuestra', () => {
  const competitors = [{ id: 'MLA1', title: 'Espuma rival', price: 11000, sold_quantity: 560, competitor_name: 'Alkanos', our_item_id: 'MLA9' }];
  const snapshots = [
    { item_id: 'MLA1', taken_on: '2026-09-23', price: 10000, sold_quantity: 500 },
    { item_id: 'MLA1', taken_on: '2026-10-16', price: 11000, sold_quantity: 540 },
    { item_id: 'MLA1', taken_on: '2026-10-23', price: 11000, sold_quantity: 560 },
  ];
  const rows = competitionRows({ competitors, snapshots, ours: [{ id: 'MLA9', title: 'Nuestra espuma', price: 12100, seller_id: '1' }], today: '2026-10-23' });
  assert.equal(rows[0].sold7, 20);
  assert.equal(rows[0].sold30, 60);
  assert.equal(rows[0].priceChange30, 10);
  assert.equal(rows[0].priceChange7, 0);
  assert.equal(rows[0].vsOur, 10);
  assert.deepEqual(competitorSummary(rows)[0], { who: 'Alkanos', items: 1, sold30: 60, cheaper: 1, linked: 1 });
  const view = trendsView([{ category_id: 'C1', taken_on: '2026-10-23', category_name: 'Aislantes', keywords: [{ keyword: 'espuma poliuretano', rank: 1 }, { keyword: 'membrana liquida', rank: 2 }] }], ['Espuma de Poliuretano 750 ml']);
  assert.deepEqual(view[0].keywords.map((trend) => trend.covered), [true, false]);
  const text = competitionContext(rows, view);
  assert.match(text, /Alkanos: Espuma rival a \$ 11\.000 \(\+10 % en 30 días\), vendió ~60 en 30 días; la nuestra/);
  assert.match(text, /10 % más cara/);
  assert.match(text, /membrana liquida \(Aislantes\)/);
  assert.ok(asksMlCompetition('cómo viene la competencia en mercado libre?'));
  assert.ok(asksMlCompetition('qué es lo más buscado'));
  assert.ok(!asksMlCompetition('cuanto rinde el easyspray'));
  // La competencia de ventas directas (Academia) es otra: sin nombrar Mercado Libre no se usa esta.
  assert.ok(!asksMlCompetition('como viene la competencia'));
  assert.ok(!asksMlCompetition('competidores de espuma'));
  assert.ok(asksMlCompetition('que vendedores de ml nos compiten'));
});
