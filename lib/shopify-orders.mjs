// Pedidos nuevos de Shopify → Entregas (28/11, Felipe): cada pedido aparece en Entregas como tarjeta verde con los
// pasos Factura → Remito → Producción (se cierra al marcar el remito) y sale un mail a Brenda e info@.
// Llega por el aviso de Shopify (webhook orders/create, firmado con el secreto de la app) y, por si un aviso se
// pierde, la actualización diaria de Shopify suma los de los últimos 3 días que falten. Sin estados de pago:
// si hay pedido, ya pagó por Mercado Pago (Felipe).
import { createHmac } from 'node:crypto';
import { safeEqual } from './safe-equal.mjs';
import { buildRawMessage, refreshAccessToken, sendMessage, gmailEnabled } from './gmail.mjs';

const text = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const num = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const RETIRO = /retiro|retirar|pick.?up|sucursal|local|domínico|dominico/i;
export const AVISO_TO = 'brenda@grupopoliplast.com.ar,info@grupopoliplast.com.ar';
export const AVISO_FROM = 'felipe@grupopoliplast.com.ar';
export const WEBHOOK_URL = 'https://poli-crm.vercel.app/api/shopify-webhook';
const AVISAR_HASTA_MS = 48 * 3600 * 1000; // no se avisan pedidos viejos que el respaldo encuentre tarde

// Firma del aviso de Shopify: HMAC-SHA256 del cuerpo crudo con el secreto de la app, en base64.
export function verifyShopifyHmac(rawBody, signature, secrets = []) {
  if (!signature || !rawBody) return false;
  return secrets.filter(Boolean).some((secret) => safeEqual(createHmac('sha256', secret).update(rawBody).digest('base64'), String(signature)));
}

const joinName = (...parts) => parts.map((part) => text(part, 80)).filter(Boolean).join(' ');

// Pedido tal como lo manda el aviso de Shopify (REST: snake_case).
export function pedidoFromWebhook(order = {}) {
  const ship = order.shipping_address || {};
  const bill = order.billing_address || {};
  const customer = order.customer || {};
  const shippingTitle = text((order.shipping_lines || []).map((line) => line?.title || line?.code).filter(Boolean).join(' / '), 120);
  const address = ship.address1 ? ship : bill;
  return {
    id: text(order.admin_graphql_api_id || (order.id ? `gid://shopify/Order/${order.id}` : ''), 80),
    name: text(order.name, 40),
    created_at: order.created_at || new Date().toISOString(),
    total: num(order.current_total_price ?? order.total_price),
    currency: text(order.currency, 8),
    delivery: !shippingTitle && !order.shipping_address ? '' : RETIRO.test(shippingTitle) ? 'PICK_UP' : 'SHIPPING',
    shipping_title: shippingTitle,
    items: (order.line_items || []).slice(0, 40).map((line) => ({ sku: text(line.sku, 60), title: text(line.name || line.title, 160), qty: Number(line.quantity) || 0, price: num(line.price) })),
    cliente: clean({
      nombre: joinName(ship.first_name || customer.first_name || bill.first_name, ship.last_name || customer.last_name || bill.last_name) || text(ship.name || bill.name, 120),
      empresa: text(address.company, 120),
      telefono: text(ship.phone || order.phone || customer.phone || bill.phone, 40),
      email: text(order.email || order.contact_email || customer.email, 120),
      direccion: joinName(address.address1, address.address2),
      localidad: text(address.city, 80),
      provincia: text(address.province, 80),
      cp: text(address.zip, 20),
    }),
    cancelado: Boolean(order.cancelled_at),
  };
}

// Pedido leído por GraphQL (respaldo de la actualización diaria; sin datos del comprador si la app no los puede leer).
export function pedidoFromGraphql(node = {}) {
  const shippingTitle = text(node.shippingLine?.title || node.shippingLine?.code, 120);
  return {
    id: text(node.id, 80),
    name: text(node.name, 40),
    created_at: node.createdAt,
    total: num(node.currentTotalPriceSet?.shopMoney?.amount),
    currency: text(node.currentTotalPriceSet?.shopMoney?.currencyCode, 8),
    delivery: !node.shippingLine ? '' : RETIRO.test(shippingTitle) ? 'PICK_UP' : 'SHIPPING',
    shipping_title: shippingTitle,
    items: (node.lineItems?.nodes || []).map((line) => ({ sku: text(line.sku, 60), title: text(line.name || line.title, 160), qty: Number(line.quantity) || 0, price: num(line.originalUnitPriceSet?.shopMoney?.amount) })),
    cliente: {},
    cancelado: Boolean(node.cancelledAt),
  };
}

function clean(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value));
}

const money = (value) => (value === null || value === undefined ? '' : `$ ${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`);
const orderNumber = (id = '') => String(id).split('/').pop();

// Texto del mail interno (sin firma ni baja: es un aviso para el equipo).
export function avisoMail(pedido, shopHandle = 'poliplastarg') {
  const c = pedido.cliente || {};
  const lines = [
    `Entró el pedido ${pedido.name} en la tienda online (Shopify), ya pagado por Mercado Pago.`,
    '',
    `Total: ${money(pedido.total)}`,
    `Entrega: ${pedido.delivery === 'PICK_UP' ? 'Retiro en Villa Domínico' : pedido.delivery === 'SHIPPING' ? `Envío${pedido.shipping_title ? ` (${pedido.shipping_title})` : ''}` : pedido.shipping_title || 'sin dato'}`,
  ];
  if (c.nombre || c.empresa) lines.push(`Cliente: ${[c.nombre, c.empresa].filter(Boolean).join(' — ')}`);
  if (c.telefono) lines.push(`Teléfono: ${c.telefono}`);
  if (c.email) lines.push(`Mail: ${c.email}`);
  if (c.direccion) lines.push(`Dirección: ${[c.direccion, c.localidad, c.provincia, c.cp].filter(Boolean).join(', ')}`);
  lines.push('', 'Productos:');
  for (const item of pedido.items || []) lines.push(`- ${item.qty} × ${item.title}${item.sku ? ` (${item.sku})` : ''}${item.price !== null && item.price !== undefined ? ` — ${money(item.price)} c/u` : ''}`);
  lines.push('', 'Pasos: factura → remito → producción. Se marcan en Entregas (tarjeta verde «Pedidos de Shopify»); al cargar el remito se cierra.');
  lines.push(`Ver el pedido en Shopify: https://admin.shopify.com/store/${shopHandle}/orders/${orderNumber(pedido.id)}`);
  lines.push('Entregas: https://poli-crm.vercel.app/');
  return { subject: `Pedido nuevo de Shopify ${pedido.name} — ${money(pedido.total)}`, body: lines.join('\n') };
}

// Manda el mail desde la casilla conectada al CRM (Gmail de Felipe por defecto) y anota avisado_at.
export async function notifyPedido(pedido, store, environment = process.env, http = fetch) {
  if (pedido.cancelado) return { sent: false, reason: 'cancelado' };
  if (!gmailEnabled(environment)) return { sent: false, reason: 'gmail sin configurar' };
  const from = text(environment.SHOPIFY_AVISO_FROM || AVISO_FROM, 120).toLowerCase();
  const to = text(environment.SHOPIFY_AVISO_TO || AVISO_TO, 400);
  const [account] = await store.select(`gmail_accounts?select=email,refresh_token&email=eq.${encodeURIComponent(from)}`);
  if (!account?.refresh_token) return { sent: false, reason: `${from} no tiene Gmail conectado al CRM` };
  const accessToken = await refreshAccessToken({ refreshToken: account.refresh_token, clientId: environment.GOOGLE_CLIENT_ID, clientSecret: environment.GOOGLE_CLIENT_SECRET }, http);
  const { subject, body } = avisoMail(pedido);
  await sendMessage({ accessToken, raw: buildRawMessage({ from, to, subject, body }) }, http);
  await store.update('shopify_pedidos', `id=eq.${encodeURIComponent(pedido.id)}`, { avisado_at: new Date().toISOString() });
  return { sent: true };
}

// Guarda el pedido si es nuevo (no pisa los pasos ya marcados) y avisa una sola vez.
export async function receivePedido(pedido, store, environment = process.env, http = fetch, now = Date.now()) {
  if (!pedido.id) return { saved: false };
  const { conflict } = await store.insert('shopify_pedidos', [pedido]);
  if (conflict) {
    if (pedido.cancelado) await store.update('shopify_pedidos', `id=eq.${encodeURIComponent(pedido.id)}`, { cancelado: true });
    return { saved: false, existed: true };
  }
  const fresh = now - new Date(pedido.created_at).getTime() < AVISAR_HASTA_MS;
  if (!fresh) return { saved: true, notified: false };
  try {
    const result = await notifyPedido(pedido, store, environment, http);
    return { saved: true, notified: result.sent, reason: result.reason };
  } catch (error) {
    console.error('shopify-pedido aviso', text(error?.message || error, 200));
    return { saved: true, notified: false, reason: text(error?.message || error, 160) };
  }
}

// Aviso de Shopify (POST /api/shopify-webhook, reescrito al receptor de webhooks). rawBody = Buffer sin parsear.
export async function handleShopifyWebhook({ rawBody, headers = {} }, store, environment = process.env, http = fetch) {
  const signature = headers['x-shopify-hmac-sha256'];
  const secrets = [environment.SHOPIFY_WEBHOOK_SECRET, environment.SHOPIFY_CLIENT_SECRET];
  if (!verifyShopifyHmac(rawBody, signature, secrets)) return { status: 401, body: { ok: false } };
  let order;
  try { order = JSON.parse(rawBody.toString('utf8')); } catch { return { status: 400, body: { ok: false } }; }
  const topic = String(headers['x-shopify-topic'] || '');
  if (order?.test) return { status: 200, body: { ok: true, skipped: 'prueba' } };
  const pedido = pedidoFromWebhook(order);
  if (topic === 'orders/cancelled') {
    await store.update('shopify_pedidos', `id=eq.${encodeURIComponent(pedido.id)}`, { cancelado: true });
    return { status: 200, body: { ok: true } };
  }
  if (topic && topic !== 'orders/create') return { status: 200, body: { ok: true, skipped: topic } };
  const result = await receivePedido(pedido, store, environment, http);
  return { status: 200, body: { ok: true, ...result } };
}

const RECENT_QUERY = `query($q: String) { orders(first: 50, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { id name createdAt cancelledAt test currentTotalPriceSet { shopMoney { amount currencyCode } } shippingLine { title code } lineItems(first: 40) { nodes { sku name quantity originalUnitPriceSet { shopMoney { amount } } } } } } }`;

// Respaldo diario: los pedidos de los últimos 3 días que no llegaron por el aviso.
export async function backfillPedidos(graphql, store, environment = process.env, http = fetch, now = Date.now()) {
  const since = new Date(now - 3 * 86400000).toISOString().slice(0, 10);
  const data = await graphql(RECENT_QUERY, { q: `created_at:>=${since}` });
  const nodes = (data?.orders?.nodes || []).filter((node) => !node.test && !node.cancelledAt);
  let added = 0;
  for (const node of nodes) {
    const result = await receivePedido(pedidoFromGraphql(node), store, environment, http, now);
    if (result.saved) added += 1;
  }
  return { checked: nodes.length, added };
}

// Alta del aviso en Shopify (una vez; lo hace el administrador desde el CRM). Usa la app del CRM, así firma con su secreto.
export async function subscribeWebhooks(graphql) {
  const existing = await graphql('{ webhookSubscriptions(first: 50) { nodes { id topic uri } } }');
  const have = new Set((existing?.webhookSubscriptions?.nodes || []).filter((node) => node.uri === WEBHOOK_URL).map((node) => node.topic));
  const created = [];
  for (const topic of ['ORDERS_CREATE', 'ORDERS_CANCELLED']) {
    if (have.has(topic)) continue;
    const data = await graphql('mutation($topic: WebhookSubscriptionTopic!, $uri: String!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) { webhookSubscription { id } userErrors { message } } }', { topic, uri: WEBHOOK_URL });
    const errors = data?.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length) throw new Error(`Shopify no aceptó el aviso ${topic}: ${errors.map((error) => error.message).join('; ')}`);
    created.push(topic);
  }
  return { created, existing: [...have] };
}
