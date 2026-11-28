import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFixes, cleanDescription, proposeFixes } from '../lib/ml-fix.mjs';

const long = 'Espuma de poliuretano para sellar y aislar. '.repeat(8);
const items = [
  { id: 'MLA100', seller_id: 1, status: 'active', title: 'Espuma A', sku: 'PS-1', sold_quantity: 5, description: '', description_length: 0, pictures_count: 1, picture_urls: ['https://http2.mlstatic.com/D_111-MLA1_112026-F.jpg'] },
  { id: 'MLA200', seller_id: 2, status: 'active', title: 'Espuma B', sku: 'ps-1', sold_quantity: 50, description: `${long} Más info en https://x.com o ventas@x.com`, description_length: 400, pictures_count: 4, picture_urls: ['https://http2.mlstatic.com/D_111-MLA1_112026-F.jpg', 'https://http2.mlstatic.com/D_222-MLA2_112026-F.jpg', 'https://http2.mlstatic.com/D_333-MLA3_112026-F.jpg', 'https://http2.mlstatic.com/D_444-MLA4_112026-F.jpg'] },
  { id: 'MLA300', seller_id: 1, status: 'active', title: 'Sin hermana', sku: 'ZZ', sold_quantity: 9, description: '', description_length: 0, pictures_count: 1, picture_urls: [] },
  { id: 'MLA400', seller_id: 1, status: 'active', title: 'Con variantes', sku: 'PS-1', sold_quantity: 1, description: long, description_length: 400, pictures_count: 1, picture_urls: [], variation_skus: [{ id: 1, sku: 'PS-1' }] },
  { id: 'MLA500', seller_id: 1, status: 'paused', title: 'Pausada', sku: 'PS-1', sold_quantity: 99, description: '', description_length: 0, pictures_count: 0 },
];

test('limpia links, mails y teléfonos de la descripción', () => {
  assert.equal(cleanDescription('Hola https://a.b/c mail ventas@a.com tel 11 5262-7555 fin'), 'Hola mail tel fin');
});

test('propone copiar descripción y fotos de la publicación hermana con el mismo SKU', () => {
  const plan = proposeFixes(items);
  const d = plan.descriptions.find((row) => row.id === 'MLA100');
  assert.equal(d.donor.id, 'MLA200');
  assert.doesNotMatch(d.text, /https|@/);
  assert.equal(plan.descriptions.find((row) => row.id === 'MLA300').donor, null);
  assert.ok(!plan.descriptions.some((row) => row.id === 'MLA500'), 'las pausadas no entran');
  const p = plan.photos.find((row) => row.id === 'MLA100');
  assert.equal(p.add.length, 3, 'no repite la foto que ya tiene');
  assert.match(plan.photos.find((row) => row.id === 'MLA400').blocked, /variantes/);
  assert.equal(plan.counts.descriptionsReady, 1);
});

test('aplica la descripción con PUT y, si ML no la tiene, con POST; corta si no hay permiso', async () => {
  const calls = [];
  const patched = [];
  const http = async (url, init) => {
    calls.push(`${init.method} ${url.replace('https://api.mercadolibre.com', '')}`);
    if (init.method === 'PUT') return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const store = { patch: async (table, filter, values) => patched.push([filter, values.description_length]) };
  const result = await applyFixes({ kind: 'descriptions', ids: ['MLA100'], items, tokenFor: async () => 't', http, store });
  assert.deepEqual(result.done, ['MLA100']);
  assert.deepEqual(calls, ['PUT /items/MLA100/description?api_version=2', 'POST /items/MLA100/description']);
  assert.equal(patched[0][0], 'id=eq.MLA100');

  const denied = await applyFixes({ kind: 'descriptions', ids: ['MLA100'], items, tokenFor: async () => 't', http: async () => ({ ok: false, status: 403, json: async () => ({ message: 'forbidden' }) }), store });
  assert.equal(denied.denied, true);
  assert.match(denied.failed[0].error, /403/);
});

test('fotos: mantiene las actuales y suma las nuevas al final', async () => {
  let sent;
  const http = async (url, init = {}) => {
    if (!init.method) return { ok: true, json: async () => ({ pictures: [{ id: 'P1' }], variations: [] }) };
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ pictures: [{ secure_url: 'https://a' }, { secure_url: 'https://b' }, { secure_url: 'https://c' }, { secure_url: 'https://d' }] }) };
  };
  const result = await applyFixes({ kind: 'photos', ids: ['MLA100'], items, tokenFor: async () => 't', http, store: { patch: async () => {} } });
  assert.deepEqual(result.done, ['MLA100']);
  assert.deepEqual(sent.pictures[0], { id: 'P1' });
  assert.equal(sent.pictures.length, 4);
});
