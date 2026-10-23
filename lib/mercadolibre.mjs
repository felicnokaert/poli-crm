// Mercado Libre → conocimiento del CRM (20/10). Solo LEE: publicaciones propias (título, atributos,
// descripción) y preguntas ya respondidas. Nunca publica, responde ni cambia nada en Mercado Libre.
// Las claves de la aplicación viven en Vercel (ML_CLIENT_ID, ML_CLIENT_SECRET) y los tokens de cada
// cuenta en la tabla ml_accounts, que solo lee la clave de servicio (el navegador nunca los ve).
// Solo Felipe conecta cuentas y actualiza.
import { itemHealth } from './ml-health.mjs';
import { competitorIds, refreshCompetitors, refreshTrends } from './ml-competition.mjs';
import { economicsRows, itemEconomics, sampleShipping } from './ml-economics.mjs';
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { safeEqual } from './safe-equal.mjs';

const API = 'https://api.mercadolibre.com';
const AUTH = 'https://auth.mercadolibre.com.ar/authorization';
export const ML_REDIRECT_URI = 'https://poli-crm.vercel.app/';
const ITEMS_PAGE = 50; // por llamada de sincronización (cada publicación pide además su descripción)
const QUESTIONS_PAGE = 50;
const QUESTIONS_PER_CALL = 4; // páginas de preguntas por llamada (200 preguntas)
const ML_MAX_OFFSET = 1000; // Mercado Libre no deja pedir más allá de la posición 1000
const ITEMS_PER_QUESTIONS_CALL = 20; // publicaciones por llamada al traer preguntas de a una publicación
const ITEM_FIELDS = 'id,title,permalink,status,sub_status,tags,price,currency_id,category_id,sold_quantity,available_quantity,listing_type_id,video_id,pictures,health,thumbnail,secure_thumbnail,date_created,last_updated,attributes,seller_custom_field';

async function errorText(response) {
  const body = await response.json().catch(() => null);
  return body?.message || body?.error_description || body?.error || `HTTP ${response.status}`;
}

function plainAttributes(attributes = []) {
  return (attributes || [])
    .filter((item) => item?.name && item?.value_name)
    .map((item) => ({ name: String(item.name), value: String(item.value_name) }))
    .slice(0, 60);
}

// SKU de la publicación, en mayúsculas y sin espacios (igual que el del catálogo del cotizador). Sale del atributo
// SELLER_SKU o "SKU", y si no, del campo propio del vendedor.
export function skuOfItem(item = {}) {
  const attributes = Array.isArray(item.attributes) ? item.attributes : [];
  const attribute = attributes.find((entry) => entry?.id === 'SELLER_SKU' && entry?.value_name) || attributes.find((entry) => String(entry?.name || '').toUpperCase() === 'SKU' && entry?.value_name);
  const raw = attribute?.value_name || item.seller_custom_field || '';
  return String(raw).trim().toUpperCase().replace(/\s+/g, '');
}

// Lo que se guarda de una publicación (sin datos de compradores). Sin `description` (undefined) no la
// toca: la actualización diaria solo refresca estado, video, fotos y calidad.
export function itemRow(item, sellerId, description) {
  const row = {
    id: String(item.id),
    seller_id: String(sellerId),
    title: String(item.title || ''),
    permalink: item.permalink || '',
    status: item.status || '',
    sub_status: Array.isArray(item.sub_status) ? item.sub_status.map(String).slice(0, 20) : [],
    tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 40) : [],
    price: typeof item.price === 'number' ? item.price : null,
    currency: item.currency_id || '',
    category_id: item.category_id || '',
    sold_quantity: typeof item.sold_quantity === 'number' ? item.sold_quantity : null,
    available_quantity: typeof item.available_quantity === 'number' ? item.available_quantity : null,
    listing_type: item.listing_type_id || '',
    video_id: item.video_id ? String(item.video_id) : null,
    pictures_count: Array.isArray(item.pictures) ? item.pictures.length : null,
    health: typeof item.health === 'number' ? item.health : null,
    thumbnail: String(item.secure_thumbnail || item.thumbnail || '').replace(/^http:\/\//i, 'https://'),
    picture_url: String((Array.isArray(item.pictures) && (item.pictures[0]?.secure_url || item.pictures[0]?.url)) || ''),
    item_created_at: item.date_created || null,
    item_updated_at: item.last_updated || null,
    attributes: plainAttributes(item.attributes),
    sku: skuOfItem(item),
    synced_at: new Date().toISOString(),
  };
  if (description !== undefined) row.description = String(description || '').slice(0, 20000);
  return row;
}

// Solo preguntas respondidas, sin quién preguntó.
export function questionRow(question, sellerId) {
  const answer = question?.answer?.text;
  if (!question?.id || !question?.text || !answer) return null;
  return {
    id: String(question.id),
    seller_id: String(sellerId),
    item_id: String(question.item_id || ''),
    question: String(question.text).slice(0, 4000),
    answer: String(answer).slice(0, 4000),
    asked_at: question.date_created || null,
    answered_at: question.answer?.date_created || null,
    synced_at: new Date().toISOString(),
  };
}

function db(environment, http) {
  const base = `${environment.SUPABASE_URL}/rest/v1`;
  return {
    async select(path) {
      const response = await http(`${base}/${path}`, { headers: serviceHeaders(environment) });
      if (!response.ok) throw new Error(await errorText(response));
      return response.json();
    },
    async count(path) {
      const response = await http(`${base}/${path}`, { method: 'HEAD', headers: serviceHeaders(environment, { Prefer: 'count=exact' }) });
      if (!response.ok) throw new Error(await errorText(response));
      return Number(String(response.headers?.get?.('content-range') || '').split('/')[1]) || 0;
    },
    async upsert(table, rows) {
      if (!rows.length) return;
      const response = await http(`${base}/${table}`, {
        method: 'POST',
        headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows),
      });
      if (!response.ok) throw new Error(await errorText(response));
    },
    async remove(table, filter) {
      const response = await http(`${base}/${table}?${filter}`, { method: 'DELETE', headers: serviceHeaders(environment, { Prefer: 'return=minimal' }) });
      if (!response.ok) throw new Error(await errorText(response));
    },
    async patch(table, filter, values) {
      const response = await http(`${base}/${table}?${filter}`, {
        method: 'PATCH',
        headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error(await errorText(response));
    },
  };
}

async function tokenRequest(fields, environment, http) {
  const response = await http(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: environment.ML_CLIENT_ID, client_secret: environment.ML_CLIENT_SECRET, ...fields }).toString(),
  });
  if (!response.ok) throw new Error(`Mercado Libre no aceptó la conexión: ${await errorText(response)}`);
  return response.json();
}

const expiry = (seconds) => new Date(Date.now() + (Number(seconds) || 21600) * 1000 - 5 * 60 * 1000).toISOString();

// Devuelve un token vigente; si venció, lo renueva (Mercado Libre da un refresh token nuevo cada vez).
async function freshToken(account, environment, http, store) {
  if (account.access_token && account.expires_at && new Date(account.expires_at) > new Date()) return account.access_token;
  const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: account.refresh_token }, environment, http);
  await store.patch('ml_accounts', `seller_id=eq.${encodeURIComponent(account.seller_id)}`, {
    access_token: token.access_token, refresh_token: token.refresh_token || account.refresh_token, expires_at: expiry(token.expires_in), updated_at: new Date().toISOString(),
  });
  return token.access_token;
}

async function mlGet(path, token, http) {
  // 23/10: una respuesta colgada de ML no puede comerse los 60 s de la función.
  const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Mercado Libre (${path.split('?')[0]}): ${await errorText(response)}`);
  return response.json();
}

// Modo "scan" de Mercado Libre: la búsqueda común no pasa de 1000 publicaciones (límite de offset);
// con scan cada página devuelve un scroll_id para pedir la siguiente, sin tope.
async function syncItems(account, token, offset, scrollId, http, store) {
  const scroll = scrollId ? `&scroll_id=${encodeURIComponent(scrollId)}` : '';
  const search = await mlGet(`/users/${account.seller_id}/items/search?search_type=scan&limit=${ITEMS_PAGE}${scroll}`, token, http);
  const ids = search.results || [];
  const total = Number(search.paging?.total) || 0;
  const rows = [];
  for (let index = 0; index < ids.length; index += 20) {
    const chunk = ids.slice(index, index + 20);
    const details = await mlGet(`/items?ids=${chunk.join(',')}&attributes=${ITEM_FIELDS}`, token, http);
    for (const entry of details || []) {
      if (entry?.code !== 200 || !entry.body) continue;
      const description = await mlGet(`/items/${entry.body.id}/description`, token, http).then((body) => body?.plain_text || '').catch(() => '');
      rows.push(itemRow(entry.body, account.seller_id, description));
    }
  }
  await store.upsert('ml_items', rows);
  const next = offset + ids.length;
  return { saved: rows.length, total, next, scrollId: search.scroll_id || '', done: !ids.length || !search.scroll_id || next >= total };
}

// Preguntas de toda la cuenta, de la más nueva a la más vieja. Mercado Libre corta en la posición 1000:
// si la cuenta tiene más, sigue de a una publicación (byItem), que tiene su propio tope de 1000.
async function syncQuestions(account, token, offset, http, store) {
  let next = offset;
  let total = 0;
  let saved = 0;
  for (let page = 0; page < QUESTIONS_PER_CALL; page += 1) {
    const body = await mlGet(`/questions/search?seller_id=${account.seller_id}&status=ANSWERED&sort_fields=date_created&sort_types=DESC&limit=${QUESTIONS_PAGE}&offset=${next}&api_version=4`, token, http);
    const questions = body.questions || [];
    total = Number(body.total) || 0;
    const rows = questions.map((question) => questionRow(question, account.seller_id)).filter(Boolean);
    await store.upsert('ml_questions', rows);
    saved += rows.length;
    next += questions.length;
    if (!questions.length || next >= total) return { saved, total, next, done: true };
    if (next + QUESTIONS_PAGE > ML_MAX_OFFSET) return { saved, total, next: 0, byItem: true, done: false };
  }
  return { saved, total, next, done: false };
}

async function syncQuestionsByItem(account, token, offset, http, store) {
  const seller = `seller_id=eq.${encodeURIComponent(account.seller_id)}`;
  const total = await store.count(`ml_items?select=id&${seller}`);
  const items = await store.select(`ml_items?select=id&${seller}&order=id&offset=${offset}&limit=${ITEMS_PER_QUESTIONS_CALL}`);
  let saved = 0;
  for (const { id } of items) {
    for (let start = 0; start + QUESTIONS_PAGE <= ML_MAX_OFFSET; start += QUESTIONS_PAGE) {
      const body = await mlGet(`/questions/search?item=${encodeURIComponent(id)}&status=ANSWERED&limit=${QUESTIONS_PAGE}&offset=${start}&api_version=4`, token, http);
      const questions = body.questions || [];
      const rows = questions.map((question) => questionRow(question, account.seller_id)).filter(Boolean);
      await store.upsert('ml_questions', rows);
      saved += rows.length;
      if (questions.length < QUESTIONS_PAGE || start + questions.length >= (Number(body.total) || 0)) break;
    }
  }
  const next = offset + items.length;
  return { saved, total, next, byItem: true, done: items.length < ITEMS_PER_QUESTIONS_CALL || next >= total };
}

// Resumen de la cuenta (21/10), como el "Resumen" de Mercado Libre: ventas, visitas y conversión de los
// últimos 30 días, preguntas sin responder, reputación y lo más vendido. Solo totales: no se guarda nada
// de los compradores. Cada parte que falle queda anotada en `errors` y el resto se guarda igual.
const AR_OFFSET = 3 * 3600 * 1000;
const arDay = (iso) => new Date(Date.parse(iso) - AR_OFFSET).toISOString().slice(0, 10);
const mlDate = (time) => new Date(time).toISOString().replace('Z', '-00:00');

export function summarizeOrders(orders = []) {
  const sales = { orders: 0, units: 0, amount: 0, cancelled: 0, currency: '' };
  const daily = {};
  const top = {};
  for (const order of orders) {
    if (order?.status === 'cancelled') { sales.cancelled += 1; continue; }
    if (order?.status !== 'paid') continue;
    const amount = Number(order.total_amount) || 0;
    const day = arDay(order.date_created);
    sales.orders += 1;
    sales.amount += amount;
    sales.currency ||= order.currency_id || '';
    daily[day] ||= { orders: 0, amount: 0, units: 0 };
    daily[day].orders += 1;
    daily[day].amount += amount;
    for (const line of order.order_items || []) {
      const quantity = Number(line.quantity) || 0;
      const id = String(line.item?.id || '');
      sales.units += quantity;
      daily[day].units += quantity;
      if (!id) continue;
      top[id] ||= { id, title: String(line.item?.title || ''), units: 0, amount: 0 };
      top[id].units += quantity;
      top[id].amount += quantity * (Number(line.unit_price) || 0);
    }
  }
  const topItems = Object.values(top).sort((a, b) => b.amount - a.amount || b.units - a.units).slice(0, 10);
  return { sales, daily, topItems };
}

export async function accountMetrics(account, token, http, { now = Date.now, deadline = Infinity } = {}) {
  // 60 días: los últimos 30 y los 30 anteriores, para comparar (y elegir 7, 14 o 30 días en el tablero).
  const to = now();
  const from = to - 60 * 86400000;
  const half = to - 30 * 86400000;
  const errors = [];
  let ordersBlocked = false;
  const part = async (label, run) => {
    try { return await run(); } catch (error) {
      const text = String(error?.message || error);
      if (label === 'ventas' && /UNAUTHORIZED|forbidden|403/i.test(text)) ordersBlocked = true;
      errors.push(`${label}: ${text.slice(0, 160)}`);
      return null;
    }
  };
  const orders = await part('ventas', async () => {
    const rows = [];
    for (let offset = 0; offset < 8000 && now() < deadline; offset += 50) {
      const body = await mlGet(`/orders/search?seller=${account.seller_id}&order.date_created.from=${encodeURIComponent(mlDate(from))}&order.date_created.to=${encodeURIComponent(mlDate(to))}&sort=date_desc&limit=50&offset=${offset}`, token, http);
      rows.push(...(body.results || []));
      if (!(body.results || []).length || offset + 50 >= (Number(body.paging?.total) || 0)) return rows;
    }
    errors.push('ventas: no llegó a traer todas (quedaron afuera las más viejas del período)');
    return rows;
  });
  const visits = await part('visitas', () => mlGet(`/users/${account.seller_id}/items_visits/time_window?last=60&unit=day`, token, http));
  const pending = await part('preguntas', () => mlGet(`/questions/search?seller_id=${account.seller_id}&status=UNANSWERED&api_version=4&limit=1`, token, http));
  const user = await part('reputación', () => mlGet(`/users/${account.seller_id}`, token, http));
  const inLast = (order) => Date.parse(order.date_created) >= half;
  const all = summarizeOrders(orders || []);
  const last = summarizeOrders((orders || []).filter(inLast));
  const previous = summarizeOrders((orders || []).filter((order) => !inLast(order)));
  const visitsByDay = {};
  for (const entry of visits?.results || []) if (entry?.date) visitsByDay[arDay(entry.date)] = Number(entry.total) || 0;
  const days = [];
  for (let time = from + 86400000; time <= to + 1; time += 86400000) {
    const day = arDay(new Date(time).toISOString());
    days.push({ day, orders: all.daily[day]?.orders || 0, amount: all.daily[day]?.amount || 0, units: all.daily[day]?.units || 0, visits: visits ? visitsByDay[day] ?? 0 : null });
  }
  const recent = days.slice(-30);
  const totalVisits = visits ? recent.reduce((sum, day) => sum + (day.visits || 0), 0) : null;
  const reputation = user?.seller_reputation || null;
  return {
    from: new Date(half).toISOString(),
    to: new Date(to).toISOString(),
    sales: orders ? last.sales : null,
    salesPrevious: orders ? previous.sales : null,
    ordersBlocked,
    visits: totalVisits,
    conversion: orders && totalVisits ? last.sales.orders / totalVisits : null,
    questionsPending: pending ? Number(pending.total) || 0 : null,
    reputation: reputation && {
      level: reputation.level_id || '',
      medal: reputation.power_seller_status || '',
      claims: reputation.metrics?.claims?.rate ?? null,
      delayed: reputation.metrics?.delayed_handling_time?.rate ?? null,
      cancellations: reputation.metrics?.cancellations?.rate ?? null,
      ratings: reputation.transactions?.ratings || null,
      completed: reputation.transactions?.completed ?? null,
    },
    days,
    topItems: orders ? last.topItems : [],
    // 23/10: ventas, comisión y envío por publicación (lib/ml-economics.mjs); saveMetrics lo guarda aparte.
    itemEconomics: orders ? itemEconomics(orders, { now: to }) : null,
    errors,
  };
}

// Visitas (7 y 30 días) y clips de las publicaciones activas (21/10). Los clips son los videos cortos
// verticales de Mercado Libre (los videos de YouTube ya no se usan). Si Mercado Libre no deja leer algo,
// queda vacío (null), nunca "0": así no se marca "sin clip" a una publicación que quizás lo tiene.

export function clipsCount(body) {
  if (Array.isArray(body)) return body.length;
  for (const key of ['clips', 'results', 'data', 'items']) if (Array.isArray(body?.[key])) return body[key].length;
  if (typeof body?.total === 'number') return body.total;
  if (typeof body?.paging?.total === 'number') return body.paging.total;
  return null;
}

// Respuesta de /items/{id}/visits/time_window: total de 30 días y la suma de los últimos 7.
export function windowVisits(body) {
  const days = Array.isArray(body?.results) ? body.results : [];
  const month = Number.isFinite(Number(body?.total_visits)) ? Number(body.total_visits) : days.reduce((sum, day) => sum + (Number(day.total) || 0), 0);
  const week = days.slice(-7).reduce((sum, day) => sum + (Number(day.total) || 0), 0);
  return [days.length ? week : undefined, month];
}

// 21/10: Mercado Libre solo deja pedir visitas por fecha de a UNA publicación ("maximum amount of items to
// query is 1") y frena si se pide rápido ("Too many requests"): se piden de a una, con pausa, reintento ante
// el freno y tiempo límite (lo que no llega queda para la próxima pasada). Los clips no se piden más: la
// API de clips responde UNAUTHORIZED para nuestra app en Argentina.
export async function itemExtras(account, token, ids, http, store, { now = Date.now, pause = 350, deadline = Date.now() + 40000, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const rows = [];
  const problems = new Map();
  const note = (text) => problems.set(text, (problems.get(text) || 0) + 1);
  for (const id of ids) {
    if (Date.now() > deadline) break;
    let visits = [undefined, undefined];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { visits = windowVisits(await mlGet(`/items/${id}/visits/time_window?last=30&unit=day`, token, http)); break; } catch (error) {
        const message = String(error?.message || error);
        if (/too many requests/i.test(message) && attempt < 2) { await wait(2000 * (attempt + 1)); continue; }
        note(/too many requests/i.test(message) ? 'Mercado Libre frenó por muchos pedidos seguidos' : `visitas: ${message.replace(/\(\/items\/[^)]+\)/, '').slice(0, 100)}`);
        break;
      }
    }
    rows.push({ id, seller_id: String(account.seller_id), visits_7d: visits[0] ?? null, visits_30d: visits[1] ?? null, extras_checked_at: new Date(now()).toISOString() });
    if (pause) await wait(pause);
  }
  if (rows.length) await store.upsert('ml_items', rows);
  const errors = [...problems].map(([text, count]) => `${text} (${count} publicación${count === 1 ? '' : 'es'})`);
  return { saved: rows.length, errors };
}

async function saveMetrics(account, token, http, store, options) {
  const { itemEconomics: economics, ...data } = await accountMetrics(account, token, http, options);
  await store.upsert('ml_account_metrics', [{ seller_id: String(account.seller_id), taken_on: arDay(new Date().toISOString()), data, taken_at: new Date().toISOString() }]);
  // Ganancia y reposición (23/10): lo vendido en 30 días por publicación y una muestra del envío.
  if (economics) {
    const seller = encodeURIComponent(account.seller_id);
    try {
      await store.patch('ml_item_economics', `seller_id=eq.${seller}`, { units_30d: 0, revenue_30d: 0, fees_30d: 0, updated_at: new Date().toISOString() });
      const rows = economicsRows(economics, account.seller_id);
      await store.upsert('ml_item_economics', rows);
      const existing = new Map((await store.select(`ml_item_economics?select=id,shipping_checked_at&seller_id=eq.${seller}`)).map((row) => [row.id, row.shipping_checked_at]));
      const shipping = await sampleShipping(account, rows, { get: (path, key) => mlGet(path, key, http), token, store, existing, deadline: Math.min(options?.deadline ?? Infinity, Date.now() + 15000) });
      data.errors.push(...shipping.errors);
    } catch (error) {
      data.errors.push(`ganancia: ${String(error?.message || error).slice(0, 120)}`);
    }
  }
  return data;
}

// Actualización diaria automática (cron, 21/10). Con tiempo acotado: trae las preguntas nuevas, refresca
// estado, video, fotos y calidad de todas las publicaciones y trae completas las nuevas. Lo que no llegue
// a hacer hoy lo hace mañana; la actualización completa sigue siendo el botón "Actualizar".
export async function dailyMercadoLibreRefresh(environment = process.env, http = fetch, { budgetMs = 45000, now = Date.now } = {}) {
  const deadline = now() + budgetMs;
  const store = db(environment, http);
  const accounts = await store.select('ml_accounts?select=*&order=nickname');
  const results = [];
  for (const account of accounts) {
    const result = { nickname: account.nickname, refreshed: 0, newItems: 0, newQuestions: 0, complete: false };
    try {
      if (now() > deadline) throw new Error('sin tiempo hoy');
      const token = await freshToken(account, environment, http, store);
      const seller = `seller_id=eq.${encodeURIComponent(account.seller_id)}`;
      // Preguntas nuevas primero: de la más nueva hacia atrás, hasta encontrar una ya guardada.
      for (let offset = 0; offset < 200 && now() < deadline; offset += QUESTIONS_PAGE) {
        const body = await mlGet(`/questions/search?seller_id=${account.seller_id}&status=ANSWERED&sort_fields=date_created&sort_types=DESC&limit=${QUESTIONS_PAGE}&offset=${offset}&api_version=4`, token, http);
        const rows = (body.questions || []).map((question) => questionRow(question, account.seller_id)).filter(Boolean);
        if (!rows.length) break;
        const saved = new Set((await store.select(`ml_questions?select=id&id=in.(${rows.map((row) => row.id).join(',')})`)).map((row) => row.id));
        const fresh = rows.filter((row) => !saved.has(row.id));
        await store.upsert('ml_questions', fresh);
        result.newQuestions += fresh.length;
        if (fresh.length < rows.length) break;
      }
      const known = new Set();
      for (let from = 0; ; from += 1000) {
        const page = await store.select(`ml_items?select=id&${seller}&order=id&offset=${from}&limit=1000`);
        page.forEach((row) => known.add(row.id));
        if (page.length < 1000) break;
      }
      let scrollId = '';
      let finished = false;
      while (now() < deadline) {
        const search = await mlGet(`/users/${account.seller_id}/items/search?search_type=scan&limit=100${scrollId ? `&scroll_id=${encodeURIComponent(scrollId)}` : ''}`, token, http);
        const ids = search.results || [];
        if (!ids.length) { finished = true; break; }
        for (let index = 0; index < ids.length && now() < deadline; index += 20) {
          const details = await mlGet(`/items?ids=${ids.slice(index, index + 20).join(',')}&attributes=${ITEM_FIELDS}`, token, http);
          // Separadas: la base pide que todas las filas de una tanda tengan las mismas columnas.
          const refreshed = [];
          const added = [];
          for (const entry of details || []) {
            if (entry?.code !== 200 || !entry.body) continue;
            if (known.has(String(entry.body.id))) refreshed.push(itemRow(entry.body, account.seller_id));
            else {
              const description = await mlGet(`/items/${entry.body.id}/description`, token, http).then((body) => body?.plain_text || '').catch(() => '');
              added.push(itemRow(entry.body, account.seller_id, description));
            }
          }
          await store.upsert('ml_items', refreshed);
          await store.upsert('ml_items', added);
          result.refreshed += refreshed.length;
          result.newItems += added.length;
        }
        scrollId = search.scroll_id || '';
        if (!scrollId) { finished = true; break; }
      }
      result.complete = finished;
      await store.patch('ml_accounts', seller, { last_refresh_at: new Date().toISOString() });
    } catch (error) {
      result.error = String(error?.message || error).slice(0, 200);
    }
    results.push(result);
  }
  return results;
}

// Llamada del cron de Vercel (GET con CRON_SECRET), a través de api/admin-users.js.
export async function mercadoLibreCron(request, environment = process.env, http = fetch) {
  const secret = environment.CRON_SECRET;
  if (!secret || !safeEqual(request.headers?.authorization || '', `Bearer ${secret}`)) return { status: 401, body: { error: 'No autorizado.' } };
  if (!environment.ML_CLIENT_ID || !environment.ML_CLIENT_SECRET) return { status: 200, body: { ok: true, skipped: 'sin claves de Mercado Libre' } };
  const started = Date.now();
  const store = db(environment, http);
  const metrics = [];
  for (const account of await store.select('ml_accounts?select=*&order=nickname')) {
    try {
      const token = await freshToken(account, environment, http, store);
      const data = await saveMetrics(account, token, http, store, { deadline: started + 20000 });
      metrics.push({ nickname: account.nickname, ok: !data.errors.length, errors: data.errors });
      // Visitas y clips de a tandas: cada día las que hace más tiempo que no se revisan.
      const stale = (await store.select(`ml_items?select=id&seller_id=eq.${encodeURIComponent(account.seller_id)}&status=eq.active&order=extras_checked_at.asc.nullsfirst&limit=60`)).map((row) => row.id);
      // 23/10: margen de ~12 s antes del corte de 60 s de Vercel (hubo 8 cortes el 21 y 22/10).
      if (Date.now() - started < 30000) await itemExtras(account, token, stale, http, store, { deadline: started + 36000 });
      // Calidad y experiencia de compra: cada día unas 15 de las que más venden y hace más de 7 días que no se miran.
      if (Date.now() - started < 34000) {
        const recent = new Set((await store.select(`ml_item_health?select=id&seller_id=eq.${encodeURIComponent(account.seller_id)}&checked_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`).catch(() => [])).map((row) => row.id));
        const top = (await store.select(`ml_items?select=id&seller_id=eq.${encodeURIComponent(account.seller_id)}&status=eq.active&order=sold_quantity.desc.nullslast&limit=300`)).map((row) => row.id).filter((id) => !recent.has(id)).slice(0, 15);
        await itemHealth(account, token, top, { get: (path, key) => mlGet(path, key, http), store, deadline: started + 40000 }).catch(() => null);
      }
    } catch (error) {
      metrics.push({ nickname: account.nickname, ok: false, errors: [String(error?.message || error).slice(0, 200)] });
    }
  }
  // 23/10: competencia (precio y vendidas de hoy) y tendencias de búsqueda, una vez por día.
  const competition = await dailyCompetition(environment, http, store, { deadline: started + 42000 }).catch((error) => ({ error: String(error?.message || error).slice(0, 200) }));
  const accounts = await dailyMercadoLibreRefresh(environment, http, { budgetMs: Math.max(5000, 46000 - (Date.now() - started)) });
  return { status: 200, body: { ok: accounts.every((account) => !account.error), metrics, competition, accounts } };
}

// Categorías donde más vendemos (para las tendencias).
async function ourCategories(store, max = 12) {
  const rows = await store.select('ml_items?select=category_id,sold_quantity&status=eq.active&limit=5000');
  const weight = new Map();
  for (const row of rows) if (row.category_id) weight.set(row.category_id, (weight.get(row.category_id) || 0) + 1 + Math.min(Number(row.sold_quantity) || 0, 200));
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

async function anyToken(environment, http, store) {
  const [account] = await store.select('ml_accounts?select=*&order=nickname&limit=1');
  if (!account) throw new Error('No hay cuentas de Mercado Libre conectadas.');
  return freshToken(account, environment, http, store);
}

const arToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

async function dailyCompetition(environment, http, store, { deadline }) {
  const token = await anyToken(environment, http, store);
  const get = (path, key) => mlGet(path, key, http);
  const today = arToday();
  const ids = (await store.select('ml_competitor_items?select=id&order=checked_at.asc&limit=400')).map((row) => row.id);
  const competitors = ids.length ? await refreshCompetitors(ids, { get, token, store, today }) : { saved: 0 };
  let trends = { saved: 0 };
  const done = await store.select(`ml_trends?select=category_id&taken_on=eq.${today}&limit=1`);
  if (!done.length && Date.now() < deadline) trends = await refreshTrends(await ourCategories(store), { get, token, store, today });
  return { competitors: competitors.saved, trends: trends.saved, errors: trends.errors };
}

export async function mercadoLibreAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede conectar Mercado Libre.' } };
  if (!environment.ML_CLIENT_ID || !environment.ML_CLIENT_SECRET) return { status: 400, body: { error: 'Falta cargar ML_CLIENT_ID y ML_CLIENT_SECRET en Vercel.' } };
  const store = db(environment, http);
  const op = request.body?.op;
  try {
    if (op === 'authUrl') {
      const state = String(request.body?.state || '').slice(0, 80);
      const url = `${AUTH}?response_type=code&client_id=${encodeURIComponent(environment.ML_CLIENT_ID)}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
      return { status: 200, body: { ok: true, url } };
    }
    if (op === 'exchange') {
      const code = String(request.body?.code || '');
      if (!/^TG-[\w-]+$/.test(code)) return { status: 400, body: { error: 'Código de Mercado Libre inválido.' } };
      const token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: ML_REDIRECT_URI }, environment, http);
      const me = await mlGet('/users/me', token.access_token, http);
      await store.upsert('ml_accounts', [{
        seller_id: String(token.user_id || me.id), nickname: me.nickname || '', access_token: token.access_token, refresh_token: token.refresh_token,
        expires_at: expiry(token.expires_in), connected_by_email: caller.email, updated_at: new Date().toISOString(),
      }]);
      return { status: 200, body: { ok: true, nickname: me.nickname || '' } };
    }
    if (op === 'accounts') {
      const rows = await store.select('ml_accounts?select=seller_id,nickname,updated_at,last_sync_at,last_refresh_at&order=nickname');
      return { status: 200, body: { ok: true, accounts: rows } };
    }
    // Clips (21/10): la API no los deja leer, así que Felipe pega desde Mercado Libre cuáles tienen clip.
    // complete = "esta es la lista completa": las demás activas quedan como "sin clip".
    if (op === 'clips') {
      const ids = [...new Set((Array.isArray(request.body?.ids) ? request.body.ids : []).map(String).filter((id) => /^MLA\d{6,}$/.test(id)))].slice(0, 3000);
      if (!ids.length) return { status: 400, body: { error: 'No encontré publicaciones (MLA…) en lo que pegaste.' } };
      // has = false: la lista es de las que NO tienen clip (así la da el asistente de Mercado Libre).
      const has = request.body?.has !== false;
      // "Lista completa" vale para UNA cuenta (22/10: cada cuenta tiene sus publicaciones y se revisa aparte).
      const scope = /^\d+$/.test(String(request.body?.sellerId || '')) ? `&seller_id=eq.${request.body.sellerId}` : '';
      if (request.body?.complete && scope) await store.patch('ml_items', `status=eq.active${scope}`, { clips_count: has ? 0 : 1 });
      for (let index = 0; index < ids.length; index += 100) await store.patch('ml_items', `id=in.(${ids.slice(index, index + 100).join(',')})`, { clips_count: has ? 1 : 0 });
      return { status: 200, body: { ok: true, marked: ids.length } };
    }
    // 23/10: competencia y tendencias (lib/ml-competition.mjs).
    if (op === 'competitors-add' || op === 'competitors-refresh' || op === 'trends-refresh') {
      const token = await anyToken(environment, http, store);
      const get = (path, key) => mlGet(path, key, http);
      const today = arToday();
      if (op === 'trends-refresh') return { status: 200, body: { ok: true, ...(await refreshTrends(await ourCategories(store), { get, token, store, today })) } };
      if (op === 'competitors-refresh') {
        const ids = (await store.select('ml_competitor_items?select=id&limit=400')).map((row) => row.id);
        return { status: 200, body: { ok: true, ...(await refreshCompetitors(ids, { get, token, store, today })) } };
      }
      const { ids, products } = competitorIds(request.body?.text);
      if (!ids.length) return { status: 400, body: { error: products.length ? 'Esos links son de catálogo (/p/MLA…): abrí la publicación del vendedor y pegá ese link.' : 'No encontré publicaciones (links de Mercado Libre o códigos MLA…).' } };
      const extra = { added_by: caller.email, competitor_name: String(request.body?.competitorName || '').trim().slice(0, 80) };
      const ourItem = String(request.body?.ourItemId || '').match(/MLA-?(\d{6,})/i);
      if (ourItem) extra.our_item_id = `MLA${ourItem[1]}`;
      const result = await refreshCompetitors(ids.slice(0, 100), { get, token, store, today, extra });
      return { status: 200, body: { ok: true, ...result, products: products.length } };
    }
    if (op === 'economics-cost') {
      const id = String(request.body?.id || '').match(/^MLA\d{6,}$/)?.[0];
      if (!id) return { status: 400, body: { error: 'Publicación inválida.' } };
      const cost = request.body?.unitCost === '' || request.body?.unitCost == null ? null : Number(String(request.body.unitCost).replace(/\./g, '').replace(',', '.'));
      if (cost !== null && !(cost >= 0)) return { status: 400, body: { error: 'Costo inválido.' } };
      const [item] = await store.select(`ml_items?select=seller_id&id=eq.${id}`);
      await store.upsert('ml_item_economics', [{ id, seller_id: String(item?.seller_id || ''), unit_cost: cost, cost_note: String(request.body?.note || '').slice(0, 120) }]);
      return { status: 200, body: { ok: true } };
    }
    if (op === 'competitors-remove') {
      const id = String(request.body?.id || '').match(/^MLA\d{6,}$/)?.[0];
      if (!id) return { status: 400, body: { error: 'Publicación inválida.' } };
      await store.remove('ml_competitor_snapshots', `item_id=eq.${id}`);
      await store.remove('ml_competitor_items', `id=eq.${id}`);
      return { status: 200, body: { ok: true } };
    }
    if (op === 'competitors-link') {
      const id = String(request.body?.id || '').match(/^MLA\d{6,}$/)?.[0];
      if (!id) return { status: 400, body: { error: 'Publicación inválida.' } };
      const ourItem = String(request.body?.ourItemId || '').match(/MLA-?(\d{6,})/i);
      await store.patch('ml_competitor_items', `id=eq.${id}`, { our_item_id: ourItem ? `MLA${ourItem[1]}` : '', competitor_name: String(request.body?.competitorName ?? '').trim().slice(0, 80) });
      return { status: 200, body: { ok: true } };
    }
    if (op === 'metrics') {
      const sellerId = String(request.body?.sellerId || '');
      const [account] = await store.select(`ml_accounts?select=*&seller_id=eq.${encodeURIComponent(sellerId)}`);
      if (!account) return { status: 404, body: { error: 'Esa cuenta no está conectada.' } };
      const token = await freshToken(account, environment, http, store);
      const data = await saveMetrics(account, token, http, store, { deadline: Date.now() + 40000 });
      return { status: 200, body: { ok: true, errors: data.errors } };
    }
    if (op === 'sync') {
      const sellerId = String(request.body?.sellerId || '');
      const stage = request.body?.stage === 'questions' ? 'questions' : 'items';
      const offset = Math.max(0, Number(request.body?.offset) || 0);
      const scrollId = String(request.body?.scrollId || '').slice(0, 2000);
      const [account] = await store.select(`ml_accounts?select=*&seller_id=eq.${encodeURIComponent(sellerId)}`);
      if (!account) return { status: 404, body: { error: 'Esa cuenta no está conectada.' } };
      const token = await freshToken(account, environment, http, store);
      // 23/10: calidad y experiencia de compra (lib/ml-health.mjs), primero las que más venden.
      if (request.body?.stage === 'health') {
        const seller = `seller_id=eq.${encodeURIComponent(sellerId)}&status=eq.active`;
        const total = await store.count(`ml_items?select=id&${seller}`);
        const ids = (await store.select(`ml_items?select=id&${seller}&order=sold_quantity.desc.nullslast,id&offset=${offset}&limit=30`)).map((row) => row.id);
        const health = await itemHealth(account, token, ids, { get: (path, key) => mlGet(path, key, http), store, deadline: Date.now() + 35000 });
        const next = offset + health.saved;
        const blocked = !health.saved && ids.length > 0;
        return { status: 200, body: { ok: true, stage: 'health', saved: health.saved, total, next, errors: health.errors, done: blocked || ids.length < 30 || next >= total } };
      }
      if (request.body?.stage === 'extras') {
        const seller = `seller_id=eq.${encodeURIComponent(sellerId)}&status=eq.active`;
        const total = await store.count(`ml_items?select=id&${seller}`);
        const ids = (await store.select(`ml_items?select=id&${seller}&order=id&offset=${offset}&limit=40`)).map((row) => row.id);
        const extras = await itemExtras(account, token, ids, http, store);
        const next = offset + extras.saved;
        return { status: 200, body: { ok: true, stage: 'extras', saved: extras.saved, total, next, errors: extras.errors, done: (ids.length < 40 && extras.saved === ids.length) || next >= total } };
      }
      const result = stage === 'items' ? await syncItems(account, token, offset, scrollId, http, store)
        : request.body?.byItem ? await syncQuestionsByItem(account, token, offset, http, store)
          : await syncQuestions(account, token, offset, http, store);
      if (stage === 'questions' && result.done) await store.patch('ml_accounts', `seller_id=eq.${encodeURIComponent(sellerId)}`, { last_sync_at: new Date().toISOString() });
      return { status: 200, body: { ok: true, stage, ...result } };
    }
    return { status: 400, body: { error: 'Acción inválida.' } };
  } catch (error) {
    return { status: 502, body: { error: String(error?.message || error).slice(0, 300) } };
  }
}
