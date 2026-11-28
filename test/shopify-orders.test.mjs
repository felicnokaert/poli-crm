import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { avisoMail, backfillPedidos, handleShopifyWebhook, pedidoFromWebhook, subscribeWebhooks, verifyShopifyHmac, WEBHOOK_URL } from '../lib/shopify-orders.mjs';

const SECRET = 'secreto-app';
const sign = (body) => createHmac('sha256', SECRET).update(body).digest('base64');
const env = { SHOPIFY_CLIENT_SECRET: SECRET, GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'gs' };

const ORDER = {
  id: 1180, admin_graphql_api_id: 'gid://shopify/Order/1180', name: '#1180', created_at: new Date().toISOString(),
  total_price: '45900.00', currency: 'ARS', email: 'cliente@mail.com',
  shipping_lines: [{ title: 'Envío a domicilio', code: 'EnvioPack' }],
  shipping_address: { first_name: 'Ana', last_name: 'Pérez', phone: '1155550000', address1: 'Calle 123', city: 'Quilmes', province: 'Buenos Aires', zip: '1878', company: 'Taller Ana' },
  line_items: [{ sku: 'PS-PU46-1', name: 'Espuma PU-46', quantity: 2, price: '15000.00' }],
};

function fakeStore(existing = new Set()) {
  const log = [];
  return {
    log,
    insert: async (table, rows) => { log.push(['insert', table, rows[0].id]); if (existing.has(rows[0].id)) return { conflict: true }; existing.add(rows[0].id); return { conflict: false }; },
    update: async (table, filter, values) => log.push(['update', table, filter, values]),
    select: async (path) => { log.push(['select', path]); return path.startsWith('gmail_accounts') ? [{ email: 'felipe@grupopoliplast.com.ar', refresh_token: 'r' }] : []; },
  };
}

function fakeGmail() {
  const sent = [];
  const http = async (url, init) => {
    if (url.includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'acc' }) };
    if (url.includes('gmail.googleapis.com')) { sent.push(Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8')); return { ok: true, json: async () => ({ id: 'm1', threadId: 't1' }) }; }
    throw new Error(`url inesperada ${url}`);
  };
  return { http, sent };
}

test('la firma de Shopify se verifica con el secreto de la app (y rechaza una firma falsa)', () => {
  const body = Buffer.from('{"a":1}');
  assert.equal(verifyShopifyHmac(body, sign(body), [SECRET]), true);
  assert.equal(verifyShopifyHmac(body, sign(Buffer.from('otro')), [SECRET]), false);
  assert.equal(verifyShopifyHmac(body, '', [SECRET]), false);
  assert.equal(verifyShopifyHmac(body, sign(body), [undefined, '']), false);
});

test('el pedido del aviso trae cliente, envío y productos', () => {
  const pedido = pedidoFromWebhook(ORDER);
  assert.equal(pedido.id, 'gid://shopify/Order/1180');
  assert.equal(pedido.total, 45900);
  assert.equal(pedido.delivery, 'SHIPPING');
  assert.deepEqual(pedido.items, [{ sku: 'PS-PU46-1', title: 'Espuma PU-46', qty: 2, price: 15000 }]);
  assert.equal(pedido.cliente.nombre, 'Ana Pérez');
  assert.equal(pedido.cliente.localidad, 'Quilmes');
  const retiro = pedidoFromWebhook({ ...ORDER, shipping_lines: [{ title: 'Retiro en Villa Domínico' }], shipping_address: null });
  assert.equal(retiro.delivery, 'PICK_UP');
});

test('pedido nuevo: se guarda y sale un mail a Brenda e info@ desde la casilla de Felipe; repetido no vuelve a avisar', async () => {
  const store = fakeStore();
  const { http, sent } = fakeGmail();
  const body = Buffer.from(JSON.stringify(ORDER));
  const headers = { 'x-shopify-hmac-sha256': sign(body), 'x-shopify-topic': 'orders/create' };
  const first = await handleShopifyWebhook({ rawBody: body, headers }, store, env, http);
  assert.equal(first.status, 200);
  assert.equal(first.body.notified, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /To: brenda@grupopoliplast\.com\.ar,info@grupopoliplast\.com\.ar/);
  assert.match(sent[0], /From: felipe@grupopoliplast\.com\.ar/);
  assert.ok(store.log.some(([kind, , , values]) => kind === 'update' && values?.avisado_at));
  const again = await handleShopifyWebhook({ rawBody: body, headers }, store, env, http);
  assert.equal(again.body.existed, true);
  assert.equal(sent.length, 1);
});

test('aviso sin firma válida, de prueba o cancelado', async () => {
  const store = fakeStore();
  const { http, sent } = fakeGmail();
  const body = Buffer.from(JSON.stringify(ORDER));
  const bad = await handleShopifyWebhook({ rawBody: body, headers: { 'x-shopify-hmac-sha256': 'falsa', 'x-shopify-topic': 'orders/create' } }, store, env, http);
  assert.equal(bad.status, 401);
  const testBody = Buffer.from(JSON.stringify({ ...ORDER, test: true }));
  const prueba = await handleShopifyWebhook({ rawBody: testBody, headers: { 'x-shopify-hmac-sha256': sign(testBody), 'x-shopify-topic': 'orders/create' } }, store, env, http);
  assert.equal(prueba.body.skipped, 'prueba');
  const cancel = await handleShopifyWebhook({ rawBody: body, headers: { 'x-shopify-hmac-sha256': sign(body), 'x-shopify-topic': 'orders/cancelled' } }, store, env, http);
  assert.equal(cancel.status, 200);
  assert.deepEqual(store.log.at(-1).slice(0, 2), ['update', 'shopify_pedidos']);
  assert.equal(store.log.at(-1)[3].cancelado, true);
  assert.equal(sent.length, 0);
});

test('sin Gmail conectado el pedido igual queda guardado (la tarjeta aparece en Entregas)', async () => {
  const store = { ...fakeStore(), select: async () => [] };
  const { http } = fakeGmail();
  const body = Buffer.from(JSON.stringify(ORDER));
  const result = await handleShopifyWebhook({ rawBody: body, headers: { 'x-shopify-hmac-sha256': sign(body), 'x-shopify-topic': 'orders/create' } }, store, env, http);
  assert.equal(result.body.saved, true);
  assert.equal(result.body.notified, false);
  assert.match(result.body.reason, /no tiene Gmail conectado/);
});

test('respaldo diario: suma los que faltan, sin pruebas ni cancelados, y no avisa los de más de 48 h', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const node = (id, createdAt, extra = {}) => ({ id, name: `#${id}`, createdAt, currentTotalPriceSet: { shopMoney: { amount: '100', currencyCode: 'ARS' } }, shippingLine: { title: 'Retiro en Villa Domínico' }, lineItems: { nodes: [{ sku: 'A', name: 'A', quantity: 1 }] }, ...extra });
  const graphql = async () => ({ orders: { nodes: [node('1', '2026-11-28T10:00:00Z'), node('2', '2026-11-25T13:00:00Z'), node('3', '2026-11-28T10:00:00Z', { test: true }), node('4', '2026-11-28T10:00:00Z', { cancelledAt: 'x' })] } });
  const store = fakeStore(new Set());
  const { http, sent } = fakeGmail();
  const result = await backfillPedidos(graphql, store, env, http, now);
  assert.deepEqual(result, { checked: 2, added: 2 });
  assert.equal(sent.length, 1); // solo el de hoy
});

test('el mail dice retiro o envío, cliente, productos y links', () => {
  const { subject, body } = avisoMail(pedidoFromWebhook(ORDER));
  assert.match(subject, /#1180/);
  assert.match(body, /Envío \(Envío a domicilio\)/);
  assert.match(body, /Ana Pérez — Taller Ana/);
  assert.match(body, /2 × Espuma PU-46 \(PS-PU46-1\)/);
  assert.match(body, /admin\.shopify\.com\/store\/poliplastarg\/orders\/1180/);
  assert.doesNotMatch(body, /esperando pago/i);
});

test('el alta del aviso en Shopify no repite lo que ya existe', async () => {
  const calls = [];
  const graphql = async (query, variables) => {
    calls.push(variables?.topic || 'list');
    if (query.includes('webhookSubscriptions(')) return { webhookSubscriptions: { nodes: [{ id: 'w1', topic: 'ORDERS_CREATE', uri: WEBHOOK_URL }] } };
    return { webhookSubscriptionCreate: { webhookSubscription: { id: 'w2' }, userErrors: [] } };
  };
  const result = await subscribeWebhooks(graphql);
  assert.deepEqual(result.created, ['ORDERS_CANCELLED']);
  assert.deepEqual(calls, ['list', 'ORDERS_CANCELLED']);
});
