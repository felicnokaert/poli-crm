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
const PRODUCTS_PAGE = 10;
const VARIANTS_PAGE = 25;
const num = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const text = (value, max = 4000) => String(value ?? '').slice(0, max);

// "tienda.myshopify.com", "https://tienda.myshopify.com/" o "tienda" → "tienda.myshopify.com".
export function shopDomain(value = '') {
  const clean = String(value).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!clean) return '';
  return /\./.test(clean) ? clean : `${clean}.myshopify.com`;
}

// Dos formas de conectar: la nueva (apps del Dev Dashboard, desde 2026): ID y secreto del cliente que se canjean por
// un token de 24 horas, o la vieja: un SHOPIFY_ADMIN_TOKEN fijo. Con las dos cargadas manda el token fijo.
export const shopifyConfigured = (environment = process.env) => Boolean(shopDomain(environment.SHOPIFY_STORE_DOMAIN) && (environment.SHOPIFY_ADMIN_TOKEN || (environment.SHOPIFY_CLIENT_ID && environment.SHOPIFY_CLIENT_SECRET)));

const tokenCache = new Map();
export const clearShopifyTokenCache = () => tokenCache.clear();

async function shopifyToken(environment, http, { force = false } = {}) {
  if (environment.SHOPIFY_ADMIN_TOKEN) return environment.SHOPIFY_ADMIN_TOKEN;
  const domain = shopDomain(environment.SHOPIFY_STORE_DOMAIN);
  const key = `${domain}|${environment.SHOPIFY_CLIENT_ID}`;
  const cached = tokenCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token;
  const response = await http(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: environment.SHOPIFY_CLIENT_ID, client_secret: environment.SHOPIFY_CLIENT_SECRET }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Shopify no entregó el token (${response.status}): ${text(await response.text().catch(() => ''), 200)}`);
  const body = await response.json();
  if (!body.access_token) throw new Error('Shopify no entregó el token: la respuesta vino sin access_token.');
  tokenCache.set(key, { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 86400) * 1000 });
  return body.access_token;
}

export async function shopifyGraphql(environment, http, query, variables = {}) {
  const url = `https://${shopDomain(environment.SHOPIFY_STORE_DOMAIN)}/admin/api/${environment.SHOPIFY_API_VERSION || API_VERSION}/graphql.json`;
  let refreshed = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = await shopifyToken(environment, http, { force: refreshed });
    const response = await http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    });
    // Token vencido (duran 24 h): se pide uno nuevo y se reintenta una vez.
    if (response.status === 401 && !environment.SHOPIFY_ADMIN_TOKEN && !refreshed) { refreshed = true; tokenCache.clear(); continue; }
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
      variants(first: $variants) { pageInfo { hasNextPage endCursor } nodes { id title sku barcode price compareAtPrice inventoryQuantity inventoryPolicy inventoryItem { measurement { weight { value unit } } } selectedOptions { name value } } }
    }
  }
}`;

const MORE_VARIANTS_QUERY = `query($id: ID!, $after: String) {
  product(id: $id) { variants(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id title sku barcode price compareAtPrice inventoryQuantity inventoryPolicy inventoryItem { measurement { weight { value unit } } } selectedOptions { name value } } } }
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

// Peso de la variante en gramos (Shopify lo guarda con su unidad). Sin peso no se puede cotizar el envío.
const GRAMS = { GRAMS: 1, KILOGRAMS: 1000, POUNDS: 453.592, OUNCES: 28.3495 };
export function weightGrams(weight) {
  if (!weight) return null;
  const value = Number(weight.value);
  return Number.isFinite(value) ? Math.round(value * (GRAMS[weight.unit] || 1)) : null;
}

const ORDERS_FIELDS = 'id name createdAt cancelledAt test displayFinancialStatus displayFulfillmentStatus currentTotalPriceSet { shopMoney { amount currencyCode } } fulfillmentOrders(first: 5) { nodes { status deliveryMethod { methodType } } }';

// Un pedido para vigilar la operación (sin datos del comprador): estado de pago y de entrega, y si es retiro o envío.
export function orderRow(node, now = new Date().toISOString()) {
  const methods = (node.fulfillmentOrders?.nodes || []).map((item) => item.deliveryMethod?.methodType).filter(Boolean);
  return {
    id: node.id,
    name: text(node.name, 40),
    created_at: node.createdAt,
    cancelled: Boolean(node.cancelledAt),
    test: Boolean(node.test),
    financial_status: text(node.displayFinancialStatus, 30),
    fulfillment_status: text(node.displayFulfillmentStatus, 30),
    delivery: methods.includes('PICK_UP') ? 'PICK_UP' : methods[0] || '',
    total: num(node.currentTotalPriceSet?.shopMoney?.amount),
    currency: text(node.currentTotalPriceSet?.shopMoney?.currencyCode, 8),
    synced_at: now,
  };
}

// Carrito abandonado: qué había, cuánto sumaba y cuándo (sin datos del comprador).
export function checkoutRow(node, now = new Date().toISOString()) {
  return {
    id: node.id,
    created_at: node.createdAt,
    completed: Boolean(node.completedAt),
    total: num(node.totalPriceSet?.shopMoney?.amount),
    currency: text(node.totalPriceSet?.shopMoney?.currencyCode, 8),
    items: (node.lineItems?.nodes || []).map((item) => ({ title: text(item.title, 160), quantity: Number(item.quantity) || 1 })),
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
    inventory_policy: text(node.inventoryPolicy, 12),
    weight_grams: weightGrams(node.inventoryItem?.measurement?.weight),
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
    const collect = async (search, pages) => {
      let cursor = null;
      for (let page = 0; page < pages && now() < deadline; page += 1) {
        const data = await shopifyGraphql(environment, http, `query($after: String, $q: String) { orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { ${ORDERS_FIELDS} } } }`, { after: cursor, q: search });
        orders.push(...data.orders.nodes);
        if (!data.orders.pageInfo.hasNextPage) break;
        cursor = data.orders.pageInfo.endCursor;
      }
    };
    await collect(`created_at:>=${since}`, 10);
    // Los que siguen sin entregar, sean de cuando sean (retiros que nadie retiró, envíos sin despachar).
    await collect('fulfillment_status:unfulfilled OR fulfillment_status:partial', 3);
    const seen = new Map(orders.map((node) => [node.id, node]));
    orders.length = 0;
    orders.push(...seen.values());
    ordersCount = orders.length;
    await store.upsert('shopify_daily', dailyFromOrders(orders.filter((node) => node.createdAt >= `${since}T00:00:00Z`), startedAt));
    await store.upsert('shopify_orders', orders.map((node) => orderRow(node, startedAt)));
    await store.remove('shopify_orders', `synced_at=lt.${encodeURIComponent(startedAt)}`);
  } catch (error) {
    errors.push(`pedidos: ${text(error?.message || error, 160)}`);
  }
  // Carritos abandonados de los últimos 30 días (si la llave no los deja leer, el resto queda igual).
  let checkoutsCount = 0;
  try {
    const since = new Date(now() - 30 * 86400000).toISOString().slice(0, 10);
    const data = await shopifyGraphql(environment, http, `query($q: String) { abandonedCheckouts(first: 100, sortKey: CREATED_AT, reverse: true, query: $q) { nodes { id createdAt completedAt totalPriceSet { shopMoney { amount currencyCode } } lineItems(first: 5) { nodes { title quantity } } } } }`, { q: `created_at:>=${since}` });
    const rows = data.abandonedCheckouts.nodes.map((node) => checkoutRow(node, startedAt));
    checkoutsCount = rows.length;
    await store.upsert('shopify_checkouts', rows);
    await store.remove('shopify_checkouts', `synced_at=lt.${encodeURIComponent(startedAt)}`);
  } catch (error) {
    errors.push(`carritos: ${text(error?.message || error, 160)}`);
  }
  return { ok: true, products, variants, orders: ordersCount, checkouts: checkoutsCount, complete, errors };
}

export async function shopifyAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede actualizar Shopify.' } };
  const op = request.body?.op;
  if (op === 'status') {
    const domain = shopDomain(environment.SHOPIFY_STORE_DOMAIN);
    return { status: 200, body: { ok: true, configured: shopifyConfigured(environment), domain, mode: environment.SHOPIFY_ADMIN_TOKEN ? 'token' : (environment.SHOPIFY_CLIENT_ID && environment.SHOPIFY_CLIENT_SECRET ? 'client' : '') } };
  }
  if (!shopifyConfigured(environment)) return { status: 400, body: { error: 'Falta cargar en Vercel SHOPIFY_STORE_DOMAIN y SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (o SHOPIFY_ADMIN_TOKEN).' } };
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
