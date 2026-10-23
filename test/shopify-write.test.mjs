import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductSet, createDrafts } from '../lib/shopify-write.mjs';

const env = { SHOPIFY_STORE_DOMAIN: 'x.myshopify.com', SHOPIFY_ADMIN_TOKEN: 't' };
const reply = (data) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });
const spec = { title: 'Resina epoxi cristal', tags: ['mercado-libre'], options: [{ name: 'Peso', values: ['750 g', '1,5 kg'] }], variants: [{ optionValues: ['750 g'], sku: 're-608-750', price: 9000, stock: true }, { optionValues: ['1,5 kg'], sku: 'RE-608-1500', price: 15000, stock: false }], metafields: [{ key: 'Marca', value: 'Poxiplast' }, { key: 'x', value: 'corto' }], images: ['http://inseguro/x.jpg', 'https://ml/x.jpg'] };

test('el producto siempre sale como borrador, con opciones, stock según permiso y solo imágenes https', () => {
  const con = buildProductSet({ ...spec, status: 'ACTIVE' }, { locationId: 'gid://shopify/Location/1', stockable: true });
  assert.equal(con.status, 'DRAFT');
  assert.deepEqual(con.productOptions, [{ name: 'Peso', position: 1, values: [{ name: '750 g' }, { name: '1,5 kg' }] }]);
  assert.equal(con.variants[0].inventoryQuantities[0].quantity, 999);
  assert.equal(con.variants[1].inventoryQuantities, undefined);
  assert.deepEqual(con.files.map((file) => file.originalSource), ['https://ml/x.jpg']);
  assert.deepEqual(con.metafields.map((field) => field.key), ['marca']);
  const sin = buildProductSet(spec, {});
  assert.equal(sin.variants[0].inventoryItem.tracked, false); // con stock en ML pero sin permiso de inventario: siempre disponible
  assert.equal(buildProductSet({ title: 'Suelto', variants: [{ price: 5 }] }).productOptions[0].name, 'Title');
  assert.throws(() => buildProductSet({ title: '', variants: [] }), /título/);
});

test('sin write_products no intenta crear nada; con permiso no duplica SKU y crea el resto', async () => {
  const calls = [];
  const http = (scopes, skuTaken) => async (url, options) => {
    const { query, variables } = JSON.parse(options.body);
    calls.push(query.slice(0, 30));
    if (query.includes('accessScopes')) return reply({ currentAppInstallation: { accessScopes: scopes.map((handle) => ({ handle })) } });
    if (query.includes('productVariants')) return reply({ productVariants: { nodes: skuTaken ? [{ sku: 'RE-608-750', product: { id: 'p', title: 'Ya está' } }] : [] } });
    if (query.includes('locations')) return reply({ locations: { nodes: [{ id: 'gid://shopify/Location/1' }] } });
    assert.equal(variables.input.status, 'DRAFT');
    return reply({ productSet: { product: { id: 'gid://shopify/Product/9', handle: 'resina', title: 'Resina', status: 'DRAFT' }, userErrors: [] } });
  };
  await assert.rejects(() => createDrafts(env, http(['read_products'], false), [spec]), /write_products/);
  assert.ok(!calls.some((call) => call.includes('productSet')));
  const taken = await createDrafts(env, http(['write_products'], true), [spec]);
  assert.equal(taken.ok, false);
  assert.equal(taken.results[0].code, 'duplicado');
  const done = await createDrafts(env, http(['write_products', 'write_inventory'], false), [spec]);
  assert.equal(done.ok, true);
  assert.equal(done.results[0].status, 'DRAFT');
  await assert.rejects(() => createDrafts(env, http([], false), Array(9).fill(spec)), /hasta 8/);
});
