import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyFromOrders, productRow, shopDomain, shopifyConfigured, syncShopify, variantRow } from '../lib/shopify.mjs';

test('shopDomain acepta el dominio de varias formas', () => {
  assert.equal(shopDomain('https://tienda.myshopify.com/'), 'tienda.myshopify.com');
  assert.equal(shopDomain('Tienda'), 'tienda.myshopify.com');
  assert.equal(shopDomain(''), '');
  assert.equal(shopifyConfigured({ SHOPIFY_STORE_DOMAIN: 'x', SHOPIFY_ADMIN_TOKEN: 't' }), true);
  assert.equal(shopifyConfigured({ SHOPIFY_STORE_DOMAIN: 'x' }), false);
});

test('productRow y variantRow guardan lo necesario y limpian el texto', () => {
  const product = productRow({ id: 'gid://shopify/Product/1', title: 'Balde 20L', status: 'ACTIVE', tags: ['a', 'b'], totalInventory: 12, description: '  ', seo: { title: 'T' }, mediaCount: { count: 3 }, variantsCount: { count: 2 }, featuredMedia: { preview: { image: { url: 'https://cdn/x.png' } } } }, '2026-10-24T00:00:00Z');
  assert.equal(product.description_length, 0);
  assert.equal(product.tags, 'a, b');
  assert.equal(product.image_url, 'https://cdn/x.png');
  assert.equal(product.media_count, 3);
  const variant = variantRow({ id: 'v1', sku: ' BA-20 ', price: '12000.00', compareAtPrice: null, inventoryQuantity: 5, selectedOptions: [{ name: 'Color', value: 'Rojo' }] }, 'p1');
  assert.equal(variant.sku, 'BA-20');
  assert.equal(variant.price, 12000);
  assert.equal(variant.compare_at_price, null);
  assert.deepEqual(variant.options, [{ name: 'Color', value: 'Rojo' }]);
});

test('pedidos por día: fecha argentina, sin cancelados ni de prueba', () => {
  const rows = dailyFromOrders([
    { createdAt: '2026-10-23T01:30:00Z', currentTotalPriceSet: { shopMoney: { amount: '1000.50', currencyCode: 'ARS' } } }, // 22/10 22:30 AR
    { createdAt: '2026-10-23T15:00:00Z', currentTotalPriceSet: { shopMoney: { amount: '500', currencyCode: 'ARS' } } },
    { createdAt: '2026-10-23T16:00:00Z', cancelledAt: '2026-10-23T17:00:00Z', currentTotalPriceSet: { shopMoney: { amount: '999', currencyCode: 'ARS' } } },
    { createdAt: '2026-10-23T16:00:00Z', test: true, currentTotalPriceSet: { shopMoney: { amount: '999', currencyCode: 'ARS' } } },
  ]);
  assert.deepEqual(rows.map((row) => [row.day, row.orders, row.amount]), [['2026-10-22', 1, 1000.5], ['2026-10-23', 1, 500]]);
});

function fakeShopify() {
  const calls = [];
  const variantNode = (id) => ({ id, title: 'x', sku: id, barcode: '', price: '10', compareAtPrice: null, inventoryQuantity: 1, selectedOptions: [] });
  const http = async (url, init) => {
    const { query, variables } = JSON.parse(init.body);
    calls.push(query.includes('orders(') ? 'orders' : query.includes('product(id') ? 'more' : 'products');
    if (query.includes('abandonedCheckouts(')) return { ok: true, status: 200, json: async () => ({ data: { abandonedCheckouts: { nodes: [{ id: 'c1', createdAt: '2026-10-23T10:00:00Z', totalPriceSet: { shopMoney: { amount: '50', currencyCode: 'ARS' } }, lineItems: { nodes: [{ title: 'X', quantity: 1 }] } }] } } }) };
    if (query.includes('orders(')) return { ok: true, status: 200, json: async () => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'o1', createdAt: '2026-10-23T15:00:00Z', currentTotalPriceSet: { shopMoney: { amount: '100', currencyCode: 'ARS' } } }] } } }) };
    if (query.includes('product(id')) return { ok: true, status: 200, json: async () => ({ data: { product: { variants: { pageInfo: { hasNextPage: false }, nodes: [variantNode('v-extra')] } } } }) };
    const page = variables.after ? 2 : 1;
    const nodes = [{ id: `p${page}`, title: `P${page}`, status: 'ACTIVE', tags: [], mediaCount: { count: 0 }, variantsCount: { count: 26 }, variants: { pageInfo: { hasNextPage: page === 1, endCursor: 'c' }, nodes: [variantNode(`v${page}`)] } }];
    return { ok: true, status: 200, json: async () => ({ data: { products: { pageInfo: { hasNextPage: page === 1, endCursor: 'next' }, nodes } } }) };
  };
  return { http, calls };
}

test('syncShopify pagina productos, completa variantes de más, guarda pedidos y limpia lo viejo', async () => {
  const { http, calls } = fakeShopify();
  const saved = []; const removed = [];
  const store = { upsert: async (table, rows) => saved.push([table, rows.length]), remove: async (table, filter) => removed.push([table, filter.split('=')[0]]) };
  const result = await syncShopify({ SHOPIFY_STORE_DOMAIN: 'x', SHOPIFY_ADMIN_TOKEN: 't' }, http, store);
  assert.equal(result.products, 2);
  assert.equal(result.variants, 3); // producto 1: v1 + una de más; producto 2: v2
  assert.equal(result.orders, 1);
  assert.equal(result.complete, true);
  assert.ok(calls.includes('more'));
  assert.deepEqual(saved.map(([table]) => table), ['shopify_products', 'shopify_variants', 'shopify_products', 'shopify_variants', 'shopify_daily', 'shopify_orders', 'shopify_checkouts']);
  assert.equal(result.checkouts, 1);
  assert.deepEqual(removed.map(([table]) => table), ['shopify_variants', 'shopify_products', 'shopify_orders', 'shopify_checkouts']);
});

test('si faltan los permisos de pedidos, el catálogo igual queda guardado y se avisa', async () => {
  const base = fakeShopify().http;
  const http = async (url, init) => (JSON.parse(init.body).query.includes('orders(') ? { ok: true, status: 200, json: async () => ({ errors: [{ message: 'Access denied for orders field.' }] }) } : base(url, init));
  const store = { upsert: async () => {}, remove: async () => {} };
  const result = await syncShopify({ SHOPIFY_STORE_DOMAIN: 'x', SHOPIFY_ADMIN_TOKEN: 't' }, http, store);
  assert.equal(result.products, 2);
  assert.match(result.errors.join(' '), /pedidos: .*Access denied/);
});

test('con ID y secreto del cliente canjea el token, lo guarda y lo renueva si vence', async () => {
  const { clearShopifyTokenCache, shopifyGraphql } = await import('../lib/shopify.mjs');
  clearShopifyTokenCache();
  const env = { SHOPIFY_STORE_DOMAIN: 'poliplastarg', SHOPIFY_CLIENT_ID: 'id1', SHOPIFY_CLIENT_SECRET: 'sec1' };
  assert.equal(shopifyConfigured(env), true);
  const log = [];
  let tokens = 0;
  let expireNext = false;
  const http = async (url, init) => {
    if (url.endsWith('/admin/oauth/access_token')) {
      tokens += 1;
      log.push(['token', String(init.body)]);
      return { ok: true, status: 200, json: async () => ({ access_token: `tok${tokens}`, expires_in: 86399 }) };
    }
    log.push(['graphql', init.headers['X-Shopify-Access-Token']]);
    if (expireNext && init.headers['X-Shopify-Access-Token'] === 'tok1') return { ok: false, status: 401, text: async () => 'expired' };
    return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) };
  };
  await shopifyGraphql(env, http, 'query { shop { name } }');
  await shopifyGraphql(env, http, 'query { shop { name } }');
  assert.equal(tokens, 1); // el segundo pedido reutiliza el token
  assert.match(log[0][1], /grant_type=client_credentials/);
  assert.match(log[0][1], /client_id=id1/);
  expireNext = true;
  const data = await shopifyGraphql(env, http, 'query { shop { name } }');
  assert.deepEqual(data, { ok: true });
  assert.equal(tokens, 2); // el 401 pidió un token nuevo
  assert.equal(log.at(-1)[1], 'tok2');
  clearShopifyTokenCache();
});

test('el token fijo (forma vieja) tiene prioridad y no se canjea nada', async () => {
  const { shopifyGraphql } = await import('../lib/shopify.mjs');
  let exchanged = false;
  const http = async (url, init) => { if (url.endsWith('/admin/oauth/access_token')) exchanged = true; return { ok: true, status: 200, json: async () => ({ data: { used: init.headers['X-Shopify-Access-Token'] } }) }; };
  const data = await shopifyGraphql({ SHOPIFY_STORE_DOMAIN: 'x', SHOPIFY_ADMIN_TOKEN: 'fijo', SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' }, http, 'query { shop { name } }');
  assert.equal(data.used, 'fijo');
  assert.equal(exchanged, false);
});
