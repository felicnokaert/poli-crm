// Shopify en el CRM (24/10, etapas 1 y 2): espejo de SOLO LECTURA de la tienda (productos, variantes y pedidos por día)
// para ver el catálogo, qué le falta a cada producto y cómo viene vendiendo. Nada se escribe en Shopify desde acá:
// la llave que se pide es de lectura (read_products, read_inventory, read_orders). Los cambios en la tienda (precios,
// variantes) vienen en etapas siguientes y con aprobación. Tiempo real: se actualiza solo todos los días y con el botón;
// los webhooks de Shopify quedan para una etapa posterior (hay que verificar su firma).
import { db } from './mercadolibre.mjs';
import { authenticatedCorporateUser } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { safeEqual } from './safe-equal.mjs';

const API_VERSION = '2026-07';
const PRODUCTS_PAGE = 20;
const VARIANTS_PAGE = 25;
const num = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const text = (value, max = 4000) => String(value ?? '').slice(0, max);

// "tienda.myshopify.com", "https://tienda.myshopify.com/" o "tienda" → "tienda.myshopify.com".
export function shopDomain(value = '') {
  const clean = String(value).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!clean) return '';
  return /\./.test(clean) ? clean : `${clean}.myshopify.com`;
}

export const shopifyConfigured = (environment = process.env) => Boolean(shopDomain(environment.SHOPIFY_STORE_DOMAIN) && environment.SHOPIFY_ADMIN_TOKEN);

export async function shopifyGraphql(environment, http, query, variables = {}) {
  const url = `https://${shopDomain(environment.SHOPIFY_STORE_DOMAIN)}/admin/api/${environment.SHOPIFY_API_VERSION || API_VERSION}/graphql.json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': environment.SHOPIFY_ADMIN_TOKEN },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429) { await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1))); continue; }
    if (!response.ok) throw new Error(`Shopify ${response.status}: ${text(await response.text().catch(() => ''), 200)}`);
    const body = await response.json();
    const errors = body.errors;
    if (errors && (Array.isArray(errors) ? errors.length : true)) {
      const message = Array.isArray(errors) ? errors.map((error) => error.message).join('; ') : String(errors);
      if (/throttled/i.test(message)) { await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1))); continue; }
      throw new Error(`Shopify: ${text(message, 240)}`);
    }
    return body.data;
  }
  throw new Error('Shopify limitó las consultas; probá de nuevo en un minuto.');
}

const PRODUCTS_QUERY = `query($after: String, $first: Int!, $variants: Int!) {
  products(first: $first, after: $after, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status vendor productType tags totalInventory onlineStoreUrl updatedAt description
      seo { title description }
      featuredMedia { preview { image { url } } }
      mediaCount { count }
      variantsCount { count }
      variants(first: $variants) { pageInfo { hasNextPage endCursor } nodes { id title sku barcode price compareAtPrice inventoryQuantity selectedOptions { name value } } }
    }
  }
}`;

const MORE_VARIANTS_QUERY = `query($id: ID!, $after: String) {
  product(id: $id) { variants(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id title sku barcode price compareAtPrice inventoryQuantity selectedOptions { name value } } } }
}`;

export function productRow(node, now = new Date().toISOString()) {
  return {
    id: node.id,
    title: text(node.title, 300),
    handle: text(node.handle, 200),
    status: text(node.status, 20),
    vendor: text(node.vendor, 120),
    product_type: text(node.productType, 120),
    tags: text((node.tags || []).join(', '), 500),
    description_length: String(node.description || '').trim().length,
    seo_title: text(node.seo?.title, 300),
    seo_description: text(node.seo?.description, 500),
    image_url: text(node.featuredMedia?.preview?.image?.url, 600),
    media_count: Number(node.mediaCount?.count) || 0,
    total_inventory: num(node.totalInventory),
    variants_count: Number(node.variantsCount?.count) || 0,
    online_url: text(node.onlineStoreUrl, 400),
    shopify_updated_at: node.updatedAt || null,
    synced_at: now,
  };
}

export function variantRow(node, productId, now = new Date().toISOString()) {
  return {
    id: node.id,
    product_id: productId,
    title: text(node.title, 200),
    sku: text(node.sku, 120).trim(),
    barcode: text(node.barcode, 60),
    price: num(node.price),
    compare_at_price: num(node.compareAtPrice),
    inventory_quantity: num(node.inventoryQuantity),
    options: (node.selectedOptions || []).map((option) => ({ name: text(option.name, 60), value: text(option.value, 120) })),
    synced_at: now,
  };
}

// Pedidos por día (fecha argentina) de los no cancelados ni de prueba.
export function dailyFromOrders(orders = [], now = new Date().toISOString()) {
  const days = new Map();
  for (const order of orders) {
    if (order.cancelledAt || order.test) continue;
    const day = new Date(Date.parse(order.createdAt) - 3 * 3600000).toISOString().slice(0, 10);
    const money = order.currentTotalPriceSet?.shopMoney;
    const entry = days.get(day) || { day, orders: 0, amount: 0, currency: money?.currencyCode || '', synced_at: now };
    entry.orders += 1;
    entry.amount += Number(money?.amount) || 0;
    days.set(day, entry);
  }
  return [...days.values()].map((entry) => ({ ...entry, amount: Math.round(entry.amount * 100) / 100 }));
}

// Trae todo y lo guarda. Lo que ya no está en la tienda se saca del espejo si se llegó hasta el final.
export async function syncShopify(environment, http, store, { deadline = Infinity, now = () => Date.now() } = {}) {
  const startedAt = new Date(now()).toISOString();
  const errors = [];
  let products = 0;
  let variants = 0;
  let complete = true;
  let after = null;
  for (;;) {
    if (now() > deadline) { complete = false; errors.push('Se acabó el tiempo: tocá "Actualizar ahora" otra vez para seguir.'); break; }
    const data = await shopifyGraphql(environment, http, PRODUCTS_QUERY, { after, first: PRODUCTS_PAGE, variants: VARIANTS_PAGE });
    const page = data.products;
    const productRows = [];
    const variantRows = [];
    for (const node of page.nodes) {
      productRows.push(productRow(node, startedAt));
      const list = [...node.variants.nodes];
      let more = node.variants.pageInfo;
      while (more?.hasNextPage) {
        const extra = await shopifyGraphql(environment, http, MORE_VARIANTS_QUERY, { id: node.id, after: more.endCursor });
        list.push(...extra.product.variants.nodes);
        more = extra.product.variants.pageInfo;
      }
      for (const variant of list) variantRows.push(variantRow(variant, node.id, startedAt));
    }
    await store.upsert('shopify_products', productRows);
    await store.upsert('shopify_variants', variantRows);
    products += productRows.length;
    variants += variantRows.length;
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  if (complete && products > 0) {
    await store.remove('shopify_variants', `synced_at=lt.${encodeURIComponent(startedAt)}`);
    await store.remove('shopify_products', `synced_at=lt.${encodeURIComponent(startedAt)}`);
  }
  // Pedidos de los últimos 30 días (necesita read_orders; si falta, el resto igual queda guardado).
  let ordersCount = 0;
  try {
    const since = new Date(now() - 30 * 86400000).toISOString().slice(0, 10);
    const orders = [];
    let cursor = null;
    for (let page = 0; page < 10 && now() < deadline; page += 1) {
      const data = await shopifyGraphql(environment, http, `query($after: String, $q: String) { orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { createdAt cancelledAt test currentTotalPriceSet { shopMoney { amount currencyCode } } } } }`, { after: cursor, q: `created_at:>=${since}` });
      orders.push(...data.orders.nodes);
      if (!data.orders.pageInfo.hasNextPage) break;
      cursor = data.orders.pageInfo.endCursor;
    }
    ordersCount = orders.length;
    await store.upsert('shopify_daily', dailyFromOrders(orders, startedAt));
  } catch (error) {
    errors.push(`pedidos: ${text(error?.message || error, 160)}`);
  }
  return { ok: true, products, variants, orders: ordersCount, complete, errors };
}

export async function shopifyAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede actualizar Shopify.' } };
  const op = request.body?.op;
  if (op === 'status') {
    const domain = shopDomain(environment.SHOPIFY_STORE_DOMAIN);
    return { status: 200, body: { ok: true, configured: shopifyConfigured(environment), domain, hasToken: Boolean(environment.SHOPIFY_ADMIN_TOKEN) } };
  }
  if (!shopifyConfigured(environment)) return { status: 400, body: { error: 'Falta cargar SHOPIFY_STORE_DOMAIN y SHOPIFY_ADMIN_TOKEN en Vercel.' } };
  if (op === 'sync') {
    try {
      const result = await syncShopify(environment, http, db(environment, http), { deadline: Date.now() + 45000 });
      return { status: 200, body: result };
    } catch (error) {
      return { status: 502, body: { error: text(error?.message || error, 300) } };
    }
  }
  return { status: 400, body: { error: 'Operación desconocida.' } };
}

export async function shopifyCron(request, environment = process.env, http = fetch) {
  const secret = environment.CRON_SECRET;
  if (!secret || !safeEqual(request.headers?.authorization || '', `Bearer ${secret}`)) return { status: 401, body: { error: 'No autorizado.' } };
  if (!shopifyConfigured(environment)) return { status: 200, body: { ok: true, skipped: 'sin llave de Shopify' } };
  try {
    return { status: 200, body: await syncShopify(environment, http, db(environment, http), { deadline: Date.now() + 45000 }) };
  } catch (error) {
    return { status: 200, body: { ok: false, error: text(error?.message || error, 300) } };
  }
}
