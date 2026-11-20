// Control de etiquetas de Mercado Libre (19/11): API de SOLO CONSULTA para la app de preparación (app de conteo, otro repositorio).
// El CRM no guarda nada de las etiquetas (escaneos, cortes y feriados viven en la base de esa app) y NUNCA devuelve datos del comprador:
// solo estado del envío, cuenta, SKU y cantidad. Clave larga en el encabezado X-Api-Key (LABELS_API_KEY; LABELS_API_KEY_NEXT permite
// rotarla sin cortar: las dos valen hasta que se borra la vieja). Rutas (vercel.json las reescribe a /api/admin-users?etiquetas=...):
//   GET /api/etiquetas/lookup?ids=1,2,3[&desc=1]   GET /api/etiquetas/pending?from=&to=   GET /api/etiquetas/health
import { db, freshToken, skuOfItem, variationSkus } from './mercadolibre.mjs';
import { safeEqual } from './safe-equal.mjs';

const API = 'https://api.mercadolibre.com';
export const MAX_IDS = 50;
const READY = new Set(['ready_to_print', 'printed', 'ready_for_pickup']);
const hits = new Map(); // límite de pedidos por clave, por instancia (best effort)
export const RATE_LIMIT = 120; // por minuto

export function keyIsValid(received, environment = process.env) {
  return [environment.LABELS_API_KEY, environment.LABELS_API_KEY_NEXT].some((key) => key && String(key).length >= 24 && safeEqual(String(received || ''), String(key)));
}
export function rateLimited(key, now = Date.now()) {
  const bucket = Math.floor(now / 60000);
  const entry = hits.get(key);
  const count = entry?.bucket === bucket ? entry.count + 1 : 1;
  hits.set(key, { bucket, count });
  return count > RATE_LIMIT;
}
export function parseIds(text) {
  return [...new Set(String(text || '').split(/[,\s]+/).map((part) => part.replace(/\D/g, '')).filter((id) => id.length >= 8 && id.length <= 16))].slice(0, MAX_IDS);
}
// Fecha ISO con hora de Argentina (-03:00).
export function arIso(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return `${new Date(ms - 3 * 3600000).toISOString().slice(0, 19)}-03:00`;
}
export const isFull = (shipment) => (shipment?.logistic_type || shipment?.logistic?.type) === 'fulfillment';
export const isReady = (shipment) => shipment?.status === 'ready_to_ship' && READY.has(shipment?.substatus) && !isFull(shipment);

// Fecha límite para despachar y fecha de cancelación. ML las manda en distintos lugares según el formato:
// se prueba cada uno y, si no viene, queda null (nunca se inventa).
const firstDate = (...values) => values.map((value) => (value && typeof value === 'object' ? value.date : value)).find((value) => value && Number.isFinite(Date.parse(value))) || null;
export function shipmentDates(shipment = {}) {
  const lead = shipment.lead_time || {};
  const option = shipment.shipping_option || {};
  const history = shipment.status_history || {};
  const dispatchBy = firstDate(lead.estimated_handling_limit, option.estimated_handling_limit, shipment.estimated_handling_limit, lead.buffering, option.buffering);
  const cancelledAt = shipment.status === 'cancelled'
    ? firstDate(history.date_cancelled, shipment.date_cancelled, shipment.cancelled_at)
    : null;
  return { dispatch_by: dispatchBy ? arIso(dispatchBy) : null, cancelled_at: cancelledAt ? arIso(cancelledAt) : null, last_updated: shipment.last_updated ? arIso(shipment.last_updated) : null };
}

async function mlGet(http, path, token, headers = {}) {
  const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12000) });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

// SKU y título por publicación (el envío no trae el SKU: sale de ml_items.sku).
async function itemInfo(store, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  for (let index = 0; index < unique.length; index += 100) {
    const rows = await store.select(`ml_items?select=id,sku,title,variation_skus&id=in.(${unique.slice(index, index + 100).join(',')})`).catch(() => []);
    for (const row of rows) map.set(row.id, row);
  }
  return map;
}
// SKU de una línea (20/11: las publicaciones con variaciones guardan el SKU en cada variación). Orden: SKU de la publicación → el de la
// variación que se vendió (variation_id) → el único que comparten todas → si quedan varios sin poder elegir, sku null y sku_options.
export function pickSku(row = {}, variationId = '') {
  if (row?.sku) return { sku: String(row.sku), options: [] };
  const options = (Array.isArray(row?.variation_skus) ? row.variation_skus : []).map((entry) => ({ id: String(entry.id), sku: String(entry.sku) }));
  const sold = variationId ? options.find((entry) => entry.id === String(variationId)) : null;
  if (sold) return { sku: sold.sku, options: [] };
  const distinct = [...new Set(options.map((entry) => entry.sku))];
  if (distinct.length === 1) return { sku: distinct[0], options: [] };
  return { sku: null, options: distinct.slice(0, 12) };
}
const lineOf = (itemId, qty, info, withDesc, variationId = '') => {
  const row = info.get(itemId);
  const { sku, options } = pickSku(row, variationId);
  const line = { sku, qty: Number(qty) || 0, item_id: itemId || null };
  if (options.length) line.sku_options = options;
  if (withDesc) line.description = String(row?.title || '').slice(0, 120);
  return line;
};

// Si el espejo no tiene SKU de esa publicación (todavía no se actualizó con las variaciones), se pregunta a Mercado Libre en el momento
// con el token de la cuenta dueña y se completa el espejo en memoria (solo para esta respuesta).
async function fillLive(info, itemIds, { http, token, budget = 8 }) {
  const missing = [...new Set(itemIds.filter(Boolean))].filter((id) => { const row = info.get(id); return row && !row.sku && !(row.variation_skus || []).length; }).slice(0, budget);
  await pool(missing, 4, async (id) => {
    const live = await mlGet(http, `/items/${id}`, token);
    if (!live.ok) return;
    const row = info.get(id);
    row.sku = skuOfItem(live.body);
    row.variation_skus = variationSkus(live.body);
  }, Date.now() + 12000);
}

async function pool(list, size, job, deadline) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (next < list.length) {
      const index = next++;
      if (Date.now() > deadline) { out[index] = { skipped: true }; continue; }
      out[index] = await job(list[index]);
    }
  }));
  return out;
}

const cache = new Map(); // envío → cuenta dueña (el token de otra cuenta da 403)

export async function lookup(ids, { http, store, tokenFor, accounts, withDesc = false, deadline = Date.now() + 50000 }) {
  const shipments = await pool(ids, 6, async (id) => {
    const order = [...accounts].sort((a) => (String(a.seller_id) === cache.get(id) ? -1 : 1));
    let sawError = null;
    for (const account of order) {
      let token;
      try { token = await tokenFor(account); } catch (error) { sawError = 'sin acceso a la cuenta'; continue; }
      const shipment = await mlGet(http, `/shipments/${id}`, token, { 'x-format-new': 'true' });
      if (shipment.status === 403 || shipment.status === 404) continue;
      if (!shipment.ok) { sawError = `Mercado Libre respondió ${shipment.status}`; continue; }
      cache.set(id, String(account.seller_id));
      const items = await mlGet(http, `/shipments/${id}/items`, token);
      if (!items.ok) return { id, error: `Mercado Libre respondió ${items.status}` };
      return { id, account, shipment: shipment.body, items: Array.isArray(items.body) ? items.body : items.body?.items || [] };
    }
    return { id, notFound: !sawError, error: sawError };
  }, deadline);
  const info = await itemInfo(store, shipments.flatMap((row) => (row?.items || []).map((item) => item.item_id ?? item.id)));
  for (const row of shipments) {
    if (!row?.account) continue;
    try { await fillLive(info, (row.items || []).map((item) => item.item_id ?? item.id), { http, token: await tokenFor(row.account) }); } catch { /* sigue con lo que hay */ }
  }
  return shipments.map((row, index) => {
    const id = ids[index];
    if (!row || row.skipped) return { id, found: false, error: 'sin_tiempo' };
    if (!row.shipment) return { id, found: false, ...(row.error ? { error: row.error } : {}) };
    const shipment = row.shipment;
    return {
      id, found: true, status: shipment.status ?? null, substatus: shipment.substatus ?? null,
      cancelled: shipment.status === 'cancelled', logistic_type: shipment.logistic_type ?? shipment.logistic?.type ?? null, full: isFull(shipment),
      account: row.account.nickname || String(row.account.seller_id), date_created: arIso(shipment.date_created), ...shipmentDates(shipment),
      lines: row.items.map((item) => lineOf(item.item_id ?? item.id, item.quantity, info, withDesc, item.variation_id ?? item.variation?.id ?? '')),
    };
  });
}

// Envíos listos para despachar de pedidos pagos entre from y to (por defecto los últimos 3 días). Sin Full.
export async function pending({ http, store, tokenFor, accounts, from, to, withDesc = false, deadline = Date.now() + 50000 }) {
  const fromIso = new Date(Date.parse(from) || Date.now() - 3 * 86400000).toISOString();
  const toIso = Number.isFinite(Date.parse(to)) ? new Date(Date.parse(to)).toISOString() : '';
  const found = [];
  const errors = [];
  let partial = false;
  for (const account of accounts) {
    const label = account.nickname || String(account.seller_id);
    let token;
    try { token = await tokenFor(account); } catch { errors.push(`${label}: sin acceso`); continue; }
    const orders = [];
    for (let offset = 0; offset < 200 && Date.now() < deadline; offset += 50) {
      const page = await mlGet(http, `/orders/search?seller=${encodeURIComponent(account.seller_id)}&order.status=paid&order.date_created.from=${encodeURIComponent(fromIso)}${toIso ? `&order.date_created.to=${encodeURIComponent(toIso)}` : ''}&sort=date_desc&limit=50&offset=${offset}`, token);
      if (!page.ok) { errors.push(`${label}: pedidos (${page.status})`); break; }
      const rows = page.body?.results || [];
      orders.push(...rows);
      if (rows.length < 50) break;
    }
    const withShipping = orders.filter((order) => order.shipping?.id);
    const results = await pool(withShipping, 8, async (order) => {
      const shipment = await mlGet(http, `/shipments/${order.shipping.id}`, token, { 'x-format-new': 'true' });
      return { order, shipment: shipment.ok ? shipment.body : null };
    }, deadline);
    for (const row of results) {
      if (row?.skipped) partial = true;
      else if (row?.shipment && isReady(row.shipment)) found.push({ account: label, order: row.order, shipment: row.shipment });
    }
  }
  const info = await itemInfo(store, found.flatMap((row) => (row.order.order_items || []).map((line) => line.item?.id)));
  const seen = new Set();
  const shipments = found.filter((row) => !seen.has(row.shipment.id) && seen.add(row.shipment.id)).map((row) => ({
    id: String(row.shipment.id), found: true, status: row.shipment.status, substatus: row.shipment.substatus, cancelled: false,
    logistic_type: row.shipment.logistic_type ?? row.shipment.logistic?.type ?? null, account: row.account, date_created: arIso(row.shipment.date_created), ...shipmentDates(row.shipment),
    lines: (row.order.order_items || []).map((line) => { const made = lineOf(line.item?.id, line.quantity, info, withDesc, line.item?.variation_id ?? ''); const own = String(line.item?.seller_sku || line.item?.seller_custom_field || '').trim().toUpperCase().replace(/\s+/g, ''); return own ? { ...made, sku: own, sku_options: undefined } : made; }),
  }));
  return { shipments, partial, errors };
}

export async function health(store) {
  const rows = await store.select('ml_accounts?select=nickname,updated_at,last_sync_at,last_refresh_at');
  const times = rows.flatMap((row) => [row.updated_at, row.last_sync_at, row.last_refresh_at]).map((value) => Date.parse(value)).filter(Number.isFinite);
  return { ok: true, accounts: rows.length, last_sync_at: times.length ? arIso(new Date(Math.max(...times)).toISOString()) : null };
}

export function setCors(response, environment = process.env) {
  response.setHeader('Access-Control-Allow-Origin', environment.LABELS_ORIGINS || '*');
  response.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
}

export async function etiquetasHandler(request, response, environment = process.env, http = fetch) {
  setCors(response, environment);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  if (!environment.LABELS_API_KEY) return response.status(503).json({ error: 'Falta cargar LABELS_API_KEY en Vercel.' });
  const received = request.headers?.['x-api-key'] || '';
  if (!keyIsValid(received, environment)) return response.status(401).json({ error: 'Clave inválida.' });
  if (rateLimited(String(received).slice(-8))) return response.status(429).json({ error: 'Demasiados pedidos: esperá un minuto.' });
  const route = String(request.query?.etiquetas || '');
  const store = db(environment, http);
  try {
    if (route === 'health') return response.status(200).json(await health(store));
    if (!environment.ML_CLIENT_ID || !environment.ML_CLIENT_SECRET) return response.status(503).json({ error: 'Falta la conexión con Mercado Libre.' });
    const accounts = await store.select('ml_accounts?select=*&order=nickname');
    const tokenFor = (account) => freshToken(account, environment, http, store);
    const withDesc = request.query?.desc === '1';
    if (route === 'lookup') {
      const ids = parseIds(request.query?.ids);
      if (!ids.length) return response.status(400).json({ error: `Pasá ids de envío separados por coma (hasta ${MAX_IDS}).` });
      return response.status(200).json({ ok: true, shipments: await lookup(ids, { http, store, tokenFor, accounts, withDesc }) });
    }
    if (route === 'pending') return response.status(200).json({ ok: true, ...(await pending({ http, store, tokenFor, accounts, from: request.query?.from, to: request.query?.to, withDesc })) });
    return response.status(404).json({ error: 'Ruta desconocida.' });
  } catch (error) {
    return response.status(502).json({ error: `Falló la consulta a Mercado Libre: ${String(error?.message || error).slice(0, 160)}` });
  }
}
