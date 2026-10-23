// Contabilium (21/10): prueba la conexión de las 3 empresas y copia sus comprobantes al CRM (solo lectura:
// nunca crea, cambia ni borra nada en Contabilium). Las claves viven en Vercel
// (CONTABILIUM_<EMPRESA>_CLIENT_ID / _CLIENT_SECRET) y nunca salen del servidor. Solo Felipe.
//
// Sincronización con memoria (tabla contabilium_sync): el historial se trae desde HISTORY_START hacia hoy
// (21/10: todo el historial de las ventas directas; lo de Mercado Libre/Mercado Pago no se guarda: ya está
// en su panel y son miles de compradores sueltos. Lo que sirve son los clientes directos, fijos o por cantidad)
// en tramos de fechas (máx. 92 días; si un tramo trae demasiados se achica), guardando tramo y página en
// cada paso. Así cada pasada (botón o cron diario) sigue donde quedó. Con el historial completo, cada
// pasada vuelve a leer la última semana (notas de crédito, saldos que cambian) y lo nuevo.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { safeEqual } from './safe-equal.mjs';

const API = 'https://rest.contabilium.com';
export const CONTABILIUM_COMPANIES = [
  { key: 'POLIPLAST', name: 'Poliuretano y Plástico Proyectado (POLIPLAST)' },
  { key: 'COMARG', name: 'Foam Factory Latam (COMARG)' },
  { key: 'FOAMFACTORY', name: 'David Alejandro Benosilio (FOAM FACTORY)' },
  { key: 'POLIOCHO', name: 'POLIOCHO (aplicadores)' },
];

async function errorText(response) {
  const body = await response.json().catch(() => null);
  return body?.error_description || body?.Message || body?.message || body?.error || `HTTP ${response.status}`;
}

export function companyCredentials(environment, key) {
  const id = environment[`CONTABILIUM_${key}_CLIENT_ID`];
  const secret = environment[`CONTABILIUM_${key}_CLIENT_SECRET`];
  return id && secret ? { id, secret } : null;
}

async function token(credentials, http) {
  const response = await http(`${API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: credentials.id, client_secret: credentials.secret }).toString(),
  });
  if (!response.ok) throw new Error(`no aceptó las claves (${await errorText(response)})`);
  const body = await response.json();
  if (!body?.access_token) throw new Error('no devolvió un token');
  return body.access_token;
}

async function countOf(path, accessToken, http) {
  const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  if (!response.ok) return { error: `${path.split('?')[0]}: ${await errorText(response)}` };
  const body = await response.json().catch(() => null);
  const total = Number(body?.TotalItems ?? body?.totalItems);
  return { total: Number.isFinite(total) ? total : (Array.isArray(body?.Items) ? body.Items.length : null) };
}

export async function testContabilium(environment, http) {
  const results = [];
  for (const company of CONTABILIUM_COMPANIES) {
    const credentials = companyCredentials(environment, company.key);
    if (!credentials) { results.push({ ...company, ok: false, error: 'faltan las claves en Vercel' }); continue; }
    try {
      const accessToken = await token(credentials, http);
      const clientes = await countOf('/api/clientes/search?filtro=&page=1&pageSize=1', accessToken, http);
      const productos = await countOf('/api/conceptos/search?filtro=&page=1&pageSize=1', accessToken, http);
      const error = [clientes.error, productos.error].filter(Boolean).join(' · ');
      results.push({ ...company, ok: !error, clientes: clientes.total ?? null, productos: productos.total ?? null, ...(error ? { error } : {}) });
    } catch (error) {
      results.push({ ...company, ok: false, error: String(error?.message || error).slice(0, 200) });
    }
  }
  return results;
}

export const HISTORY_START = '2012-01-01';
const SKIP_ORIGINS = new Set(['mercadolibre', 'mercadopago']);
const REQUEST_TIMEOUT = 15000; // una consulta colgada no debe agotar los 60 s de la función
const MAX_WINDOW = 92; // días por tramo que acepta Contabilium
const MAX_PAGES = 20; // Contabilium no da más de 20 páginas por búsqueda
const PAGE_SIZE = 50;
const RECENT_DAYS = 7; // con el historial completo, cada pasada relee la última semana

const DAY = 86400000;
export function addDays(day, amount) { return new Date(Date.parse(`${day}T00:00:00Z`) + amount * DAY).toISOString().slice(0, 10); }
export function arToday(now = Date.now()) { return new Date(now - 3 * 3600000).toISOString().slice(0, 10); }
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Contabilium manda los importes como texto argentino ("39.025,52"): sin esto el total quedaba vacío.
function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'string' && value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
const text = (value) => (value === undefined || value === null || value === '' ? null : String(value).trim());

// Lo que se guarda de cada comprobante: el encabezado (la búsqueda no trae renglones) y el original.
export function comprobanteRow(item, company) {
  const id = item?.Id ?? item?.ID ?? item?.id;
  if (id === undefined || id === null) return null;
  if (SKIP_ORIGINS.has(String(item.Origen || '').toLowerCase().replace(/\s+/g, ''))) return null;
  const fecha = String(item.FechaEmision || item.Fecha || '').slice(0, 10);
  return {
    company,
    id: String(id),
    tipo: text(item.TipoFc),
    numero: text(item.Numero),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    cliente_id: text(item.IdCliente),
    cliente: text(item.RazonSocial),
    total: number(item.Total ?? item.ImporteTotalNeto),
    saldo: number(item.Saldo),
    raw: item,
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
  };
}

function freshState(company) {
  return { company, cursor_date: HISTORY_START, window_days: MAX_WINDOW, page: 1, history_done: false, total_saved: 0, last_run_at: null, last_error: null };
}

// Una pasada para una empresa hasta `deadline`; guarda la memoria en cada paso y la devuelve.
export async function syncCompany(company, environment, http, store, { deadline, now = Date.now, pause = 450 } = {}) {
  const [saved] = await store.select(`contabilium_sync?select=*&company=eq.${company.key}`);
  const state = { ...freshState(company.key), ...(saved || {}), last_error: null };
  const today = arToday(now());
  const recent = addDays(today, -RECENT_DAYS);
  if (!state.cursor_date || state.cursor_date < HISTORY_START) { state.cursor_date = HISTORY_START; state.page = 1; state.window_days = MAX_WINDOW; }
  if (state.history_done && state.page === 1 && state.cursor_date > recent) state.cursor_date = recent;
  const persist = async () => {
    state.last_run_at = new Date(now()).toISOString();
    await store.upsert('contabilium_sync', [state]);
  };
  let newRows = 0;
  const finish = async () => {
    // Guardados de verdad (releer la última semana no suma de nuevo).
    if (newRows) state.total_saved = await store.count(`contabilium_comprobantes?select=id&company=eq.${company.key}`).catch(() => state.total_saved);
    await persist();
    return { ...state, new_rows: newRows, done: state.history_done && state.cursor_date === today };
  };

  const credentials = companyCredentials(environment, company.key);
  if (!credentials) { state.last_error = 'faltan las claves en Vercel'; return finish(); }
  let accessToken;
  try { accessToken = await token(credentials, http); } catch (error) { state.last_error = String(error.message).slice(0, 300); return finish(); }

  while (now() < deadline) {
    const from = state.cursor_date;
    const end = addDays(from, state.window_days - 1);
    const to = end < today ? end : today;
    const query = new URLSearchParams({ filtro: '', fechaDesde: from, fechaHasta: to, page: String(state.page), pageSize: String(PAGE_SIZE) });
    let response;
    try {
      response = await http(`${API}/api/comprobantes/search?${query}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    } catch {
      // Tardó demasiado: se corta acá y la próxima pasada reintenta el mismo tramo y página.
      break;
    }
    if (response.status === 429) { await wait(3000); continue; }
    if (!response.ok) { state.last_error = `comprobantes del ${from} al ${to}: ${await errorText(response)}`.slice(0, 300); break; }
    const body = await response.json().catch(() => null);
    const items = Array.isArray(body?.Items) ? body.Items : (Array.isArray(body) ? body : []);
    const totalPages = number(body?.TotalPage ?? body?.totalPage);
    // Tramo con demasiados comprobantes: se achica antes de leerlo.
    if (state.page === 1 && totalPages > MAX_PAGES && state.window_days > 1) {
      state.window_days = Math.max(1, Math.floor(state.window_days / 2));
      continue;
    }
    const rows = items.map((item) => comprobanteRow(item, company.key)).filter(Boolean);
    await store.upsert('contabilium_comprobantes', rows);
    newRows += rows.length;
    const morePages = items.length >= PAGE_SIZE && state.page < MAX_PAGES && (totalPages === null || state.page < totalPages);
    if (morePages) {
      state.page += 1;
    } else if (to >= today) {
      state.history_done = true;
      state.cursor_date = today;
      state.page = 1;
      state.window_days = MAX_WINDOW;
      break;
    } else {
      // Tramo terminado: el siguiente arranca al otro día; si este vino liviano, se agranda.
      state.cursor_date = addDays(to, 1);
      state.page = 1;
      if ((totalPages ?? 1) <= MAX_PAGES / 4) state.window_days = Math.min(MAX_WINDOW, state.window_days * 2);
    }
    await persist();
    if (pause) await wait(pause); // Contabilium pide no más de 2 pedidos por segundo
  }
  return finish();
}

// ---- Fichas de clientes (22/10, OK de Felipe) ----
// Copia de solo lectura de /api/clientes/search (CUIT, teléfono, mail, ciudad) en contabilium_clientes, para
// emparejar los comprobantes con la cartera por CUIT o teléfono. Memoria en contabilium_sync con la clave
// "<EMPRESA>:clientes" (página en curso); al terminar una vuelta completa vuelve a empezar (refresca datos).
const digits = (value) => String(value ?? '').replace(/\D/g, '');
export function clienteRow(item, company) {
  const id = item?.Id ?? item?.ID ?? item?.id;
  if (id === undefined || id === null) return null;
  const doc = digits(item.NroDoc ?? item.NroDocumento ?? item.Cuit ?? item.CUIT ?? item.Documento);
  return {
    company,
    id: String(id),
    razon_social: text(item.RazonSocial ?? item.NombreFantasia ?? item.Nombre),
    cuit: doc.length >= 7 ? doc : null,
    telefono: text(item.Telefono ?? item.Celular ?? item.TelefonoCelular),
    email: text(item.Email ?? item.Mail),
    ciudad: text(item.Ciudad ?? item.Localidad),
    provincia: text(item.Provincia ?? item.ProvinciaDesc ?? item.IDProvincia),
    raw: item,
    synced_at: new Date().toISOString(),
  };
}

export async function syncClients(company, environment, http, store, { deadline, now = Date.now, pause = 450 } = {}) {
  const key = `${company.key}:clientes`;
  const [saved] = await store.select(`contabilium_sync?select=*&company=eq.${encodeURIComponent(key)}`);
  const state = { company: key, cursor_date: null, window_days: null, page: 1, history_done: false, total_saved: 0, last_run_at: null, ...(saved || {}), last_error: null };
  if (!state.page || state.page < 1) state.page = 1;
  const persist = async () => { state.last_run_at = new Date(now()).toISOString(); await store.upsert('contabilium_sync', [state]); };
  const credentials = companyCredentials(environment, company.key);
  if (!credentials) { state.last_error = 'faltan las claves en Vercel'; await persist(); return state; }
  let accessToken;
  try { accessToken = await token(credentials, http); } catch (error) { state.last_error = String(error.message).slice(0, 300); await persist(); return state; }
  let fresh = 0;
  // Con la lista completa, primero las fichas que faltan; recién sin faltantes vuelve a releer la lista.
  let missing = state.history_done ? await missingClientIds(company.key, store).catch(() => []) : [];
  while (!missing.length && now() < deadline) {
    const query = new URLSearchParams({ filtro: '', page: String(state.page), pageSize: String(PAGE_SIZE) });
    let response;
    try {
      response = await http(`${API}/api/clientes/search?${query}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    } catch { break; }
    if (response.status === 429) { await wait(3000); continue; }
    if (!response.ok) { state.last_error = `clientes, página ${state.page}: ${await errorText(response)}`.slice(0, 300); break; }
    const body = await response.json().catch(() => null);
    const items = Array.isArray(body?.Items) ? body.Items : (Array.isArray(body) ? body : []);
    const rows = items.map((item) => clienteRow(item, company.key)).filter(Boolean);
    await store.upsert('contabilium_clientes', rows);
    fresh += rows.length;
    const totalPages = number(body?.TotalPage ?? body?.totalPage);
    if (items.length >= PAGE_SIZE && (totalPages === null || state.page < totalPages)) {
      state.page += 1;
    } else {
      state.history_done = true;
      state.page = 1;
      break;
    }
    await persist();
    if (pause) await wait(pause);
  }
  // 22/10: la lista de Contabilium corta en 2.500 clientes; los que facturaron y no vinieron se piden de a uno
  // (GET /api/clientes/{id}). Si Contabilium no lo encuentra, queda una fila vacía para no volver a pedirlo.
  let missingLeft = null;
  if (state.history_done && now() < deadline) {
    if (!missing.length) missing = await missingClientIds(company.key, store).catch(() => []);
    missingLeft = missing.length;
    for (const id of missing) {
      if (now() >= deadline) break;
      let response;
      try {
        response = await http(`${API}/api/clientes/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      } catch { break; }
      if (response.status === 429) { await wait(3000); continue; }
      let row = null;
      if (response.ok) row = clienteRow(await response.json().catch(() => null), company.key);
      else if (response.status !== 404 && response.status !== 400) { state.last_error = `cliente ${id}: ${await errorText(response)}`.slice(0, 300); break; }
      await store.upsert('contabilium_clientes', [row ? { ...row, id: String(id) } : { company: company.key, id: String(id), raw: { notFound: true }, synced_at: new Date().toISOString() }]);
      fresh += 1;
      missingLeft -= 1;
      if (pause) await wait(Math.min(pause, 250));
    }
  }
  if (fresh) state.total_saved = await store.count(`contabilium_clientes?select=id&company=eq.${company.key}`).catch(() => state.total_saved);
  await persist();
  return { ...state, new_rows: fresh, missing_left: missingLeft };
}

// Clientes con comprobantes que todavía no tienen ficha copiada.
export async function missingClientIds(companyKey, store, pageSize = 1000) {
  const pageOf = async (path) => {
    const ids = new Set();
    for (let from = 0; from < 200000; from += pageSize) {
      const rows = await store.select(`${path}&offset=${from}&limit=${pageSize}`);
      for (const row of rows || []) if (row.cliente_id ?? row.id) ids.add(String(row.cliente_id ?? row.id));
      if (!rows || rows.length < pageSize) break;
    }
    return ids;
  };
  const used = await pageOf(`contabilium_comprobantes?select=cliente_id&company=eq.${companyKey}&cliente_id=not.is.null&order=id`);
  const have = await pageOf(`contabilium_clientes?select=id&company=eq.${companyKey}&order=id`);
  return [...used].filter((id) => !have.has(id));
}

async function syncStatus(store) {
  const rows = await store.select('contabilium_sync?select=*');
  return CONTABILIUM_COMPANIES.map((company) => ({ ...company, ...freshState(company.key), ...(rows.find((row) => row.company === company.key) || {}) }));
}

// Cron diario: cada empresa con su parte de los ~44 s (23/10: antes 50 s y hubo cortes a los 60 s).
export async function contabiliumCron(request, environment = process.env, http = fetch, { now = Date.now, pause } = {}) {
  const secret = environment.CRON_SECRET;
  if (!secret || !safeEqual(request.headers?.authorization || '', `Bearer ${secret}`)) return { status: 401, body: { error: 'No autorizado.' } };
  const store = db(environment, http);
  const started = now();
  const results = [];
  for (const [index, company] of CONTABILIUM_COMPANIES.entries()) {
    const deadline = started + ((index + 1) * 44000) / CONTABILIUM_COMPANIES.length;
    try {
      const state = await syncCompany(company, environment, http, store, { deadline, now, pause });
      results.push({ company: company.key, ok: !state.last_error, cursor: state.cursor_date, newRows: state.new_rows, error: state.last_error || undefined });
    } catch (error) {
      results.push({ company: company.key, ok: false, error: String(error?.message || error).slice(0, 200) });
    }
  }
  // Las fichas de clientes (CUIT, teléfono) avanzan con el tiempo que sobre.
  for (const company of CONTABILIUM_COMPANIES) {
    if (now() > started + 46000) break;
    try {
      const state = await syncClients(company, environment, http, store, { deadline: Math.min(started + 48000, now() + 12000), now, pause });
      results.push({ company: `${company.key}:clientes`, ok: !state.last_error, newRows: state.new_rows, error: state.last_error || undefined });
    } catch (error) {
      results.push({ company: `${company.key}:clientes`, ok: false, error: String(error?.message || error).slice(0, 200) });
    }
  }
  return { status: 200, body: { ok: results.every((row) => row.ok), results } };
}

export async function contabiliumAdmin(request, environment = process.env, http = fetch, { now = Date.now, pause } = {}) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede usar Contabilium.' } };
  const op = request.body?.op;
  if (op === 'test') return { status: 200, body: { ok: true, companies: await testContabilium(environment, http) } };
  const store = db(environment, http);
  if (op === 'status') return { status: 200, body: { ok: true, companies: await syncStatus(store) } };
  if (op === 'sync') {
    const company = CONTABILIUM_COMPANIES.find((item) => item.key === request.body?.company);
    if (!company) return { status: 400, body: { error: 'Empresa inválida.' } };
    const state = await syncCompany(company, environment, http, store, { deadline: now() + 35000, now, pause });
    return { status: 200, body: { ok: !state.last_error, company: { ...company, ...state }, error: state.last_error || undefined } };
  }
  if (op === 'clients') {
    const company = CONTABILIUM_COMPANIES.find((item) => item.key === request.body?.company);
    if (!company) return { status: 400, body: { error: 'Empresa inválida.' } };
    const state = await syncClients(company, environment, http, store, { deadline: now() + 35000, now, pause });
    return { status: 200, body: { ok: !state.last_error, company: { ...company, ...state }, error: state.last_error || undefined } };
  }
  return { status: 400, body: { error: 'Acción inválida.' } };
}
