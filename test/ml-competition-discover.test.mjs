import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverCompetitors, pickCompetitors, searchQuery } from '../lib/ml-competition.mjs';

test('searchQuery saca medidas y conectores', () => {
  assert.equal(searchQuery('Resina Epoxi Cristal Poxiplast 3kg Para Mesas 1,5 Litros'), 'resina epoxi cristal poxiplast mesas litros');
  assert.equal(searchQuery(''), '');
});

test('pickCompetitors deja otros vendedores, los que más venden y máx. 2 por vendedor', () => {
  const results = [
    { id: 'MLA1', seller: { id: 10 }, sold_quantity: 5 },
    { id: 'MLA2', seller: { id: 99 }, sold_quantity: 500 }, // nuestro
    { id: 'MLA3', seller: { id: 20 }, sold_quantity: 300 },
    { id: 'MLA4', seller: { id: 20 }, sold_quantity: 200 },
    { id: 'MLA5', seller: { id: 20 }, sold_quantity: 100 },
    { id: 'MLA6', seller: { id: 30 }, sold_quantity: 50 },
    { id: 'MLA7', seller: { id: 40 }, sold_quantity: 900 }, // ya seguido
  ];
  const ids = pickCompetitors(results, { ownSellers: new Set(['99']), known: new Set(['MLA7']), max: 3 });
  assert.deepEqual(ids, ['MLA3', 'MLA4', 'MLA6']);
});

const store = () => { const saved = []; return { saved, upsert: async (table, rows) => { saved.push([table, rows.length]); } }; };

test('discoverCompetitors sigue los encontrados y los vincula a nuestra publicación', async () => {
  const s = store();
  const get = async (path) => {
    if (path.startsWith('/sites/MLA/search')) return { results: [{ id: 'MLA11', seller: { id: 1 }, sold_quantity: 9 }, { id: 'MLA12', seller: { id: 2 }, sold_quantity: 3 }] };
    if (path.startsWith('/items?ids=')) return [{ code: 200, body: { id: 'MLA11', seller_id: 1, price: 10 } }, { code: 200, body: { id: 'MLA12', seller_id: 2, price: 12 } }];
    return { nickname: 'VENDEDOR' };
  };
  const result = await discoverCompetitors([{ id: 'MLA900', title: 'Espuma poliuretano', category_id: 'C1' }], { get, token: 't', store: s, today: '2026-10-23', ownSellers: new Set(), known: new Set() });
  assert.equal(result.saved, 2);
  assert.equal(result.blocked, '');
  assert.equal(result.found[0].ourItemId, 'MLA900');
  assert.deepEqual(s.saved.map(([table]) => table), ['ml_competitor_items', 'ml_competitor_snapshots']);
});

test('si Mercado Libre niega la búsqueda, corta y dice el motivo', async () => {
  const get = async () => { throw new Error('Mercado Libre (/sites/MLA/search): 403 forbidden'); };
  const result = await discoverCompetitors([{ id: 'A', title: 'Espuma', category_id: 'C1' }, { id: 'B', title: 'Resina', category_id: 'C2' }], { get, token: 't', store: store(), today: '2026-10-23', ownSellers: new Set(), known: new Set() });
  assert.match(result.blocked, /403/);
  assert.equal(result.saved, 0);
});
