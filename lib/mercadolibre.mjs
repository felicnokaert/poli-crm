// Mercado Libre → conocimiento del CRM (20/10). Solo LEE: publicaciones propias (título, atributos,
// descripción) y preguntas ya respondidas. Nunca publica, responde ni cambia nada en Mercado Libre.
// Las claves de la aplicación viven en Vercel (ML_CLIENT_ID, ML_CLIENT_SECRET) y los tokens de cada
// cuenta en la tabla ml_accounts, que solo lee la clave de servicio (el navegador nunca los ve).
// Solo Felipe conecta cuentas y actualiza.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';

const API = 'https://api.mercadolibre.com';
const AUTH = 'https://auth.mercadolibre.com.ar/authorization';
export const ML_REDIRECT_URI = 'https://poli-crm.vercel.app/';
const ITEMS_PAGE = 50; // por llamada de sincronización (cada publicación pide además su descripción)
const QUESTIONS_PAGE = 50;
const QUESTIONS_PER_CALL = 4; // páginas de preguntas por llamada (200 preguntas)

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

// Lo que se guarda de una publicación (sin datos de compradores).
export function itemRow(item, sellerId, description = '') {
  return {
    id: String(item.id),
    seller_id: String(sellerId),
    title: String(item.title || ''),
    permalink: item.permalink || '',
    status: item.status || '',
    price: typeof item.price === 'number' ? item.price : null,
    currency: item.currency_id || '',
    category_id: item.category_id || '',
    sold_quantity: typeof item.sold_quantity === 'number' ? item.sold_quantity : null,
    attributes: plainAttributes(item.attributes),
    description: String(description || '').slice(0, 20000),
    synced_at: new Date().toISOString(),
  };
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
    async upsert(table, rows) {
      if (!rows.length) return;
      const response = await http(`${base}/${table}`, {
        method: 'POST',
        headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows),
      });
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
  const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Mercado Libre (${path.split('?')[0]}): ${await errorText(response)}`);
  return response.json();
}

async function syncItems(account, token, offset, http, store) {
  const search = await mlGet(`/users/${account.seller_id}/items/search?offset=${offset}&limit=${ITEMS_PAGE}`, token, http);
  const ids = search.results || [];
  const total = Math.min(Number(search.paging?.total) || 0, 1000);
  const rows = [];
  for (let index = 0; index < ids.length; index += 20) {
    const chunk = ids.slice(index, index + 20);
    const details = await mlGet(`/items?ids=${chunk.join(',')}&attributes=id,title,permalink,status,price,currency_id,category_id,sold_quantity,attributes`, token, http);
    for (const entry of details || []) {
      if (entry?.code !== 200 || !entry.body) continue;
      const description = await mlGet(`/items/${entry.body.id}/description`, token, http).then((body) => body?.plain_text || '').catch(() => '');
      rows.push(itemRow(entry.body, account.seller_id, description));
    }
  }
  await store.upsert('ml_items', rows);
  const next = offset + ids.length;
  return { saved: rows.length, total, next, done: !ids.length || next >= total };
}

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
  }
  return { saved, total, next, done: false };
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
      const rows = await store.select('ml_accounts?select=seller_id,nickname,updated_at,last_sync_at&order=nickname');
      return { status: 200, body: { ok: true, accounts: rows } };
    }
    if (op === 'sync') {
      const sellerId = String(request.body?.sellerId || '');
      const stage = request.body?.stage === 'questions' ? 'questions' : 'items';
      const offset = Math.max(0, Number(request.body?.offset) || 0);
      const [account] = await store.select(`ml_accounts?select=*&seller_id=eq.${encodeURIComponent(sellerId)}`);
      if (!account) return { status: 404, body: { error: 'Esa cuenta no está conectada.' } };
      const token = await freshToken(account, environment, http, store);
      const result = stage === 'items' ? await syncItems(account, token, offset, http, store) : await syncQuestions(account, token, offset, http, store);
      if (stage === 'questions' && result.done) await store.patch('ml_accounts', `seller_id=eq.${encodeURIComponent(sellerId)}`, { last_sync_at: new Date().toISOString() });
      return { status: 200, body: { ok: true, stage, ...result } };
    }
    return { status: 400, body: { error: 'Acción inválida.' } };
  } catch (error) {
    return { status: 502, body: { error: String(error?.message || error).slice(0, 300) } };
  }
}
