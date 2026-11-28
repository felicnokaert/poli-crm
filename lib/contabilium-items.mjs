// Renglones de los comprobantes de Contabilium (27/11, ranking de productos). La búsqueda de comprobantes trae
// Items = null; acá se pide cada comprobante de venta por su id y se guardan sus renglones en contabilium_items
// (migración 20261127_contabilium_items.sql). Solo LEE Contabilium. Incremental: los ya leídos quedan en
// contabilium_items_seen y no se vuelven a pedir. SIN PROBAR contra Contabilium: el camino del detalle y el nombre
// de los campos de cada renglón se leen con tolerancia (se prueban dos caminos y varios nombres).
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { safeEqual } from './safe-equal.mjs';

const API = 'https://rest.contabilium.com';
const REQUEST_TIMEOUT = 12000;
export const ITEM_COMPANIES = ['POLIPLAST', 'POLIOCHO', 'FOAMFACTORY', 'COMARG'];
// FC y COT suman; NC y NCT (nota de crédito de COT) restan. ND no entra (no son productos).
export function saleSign(tipo = '') {
  const kind = String(tipo).toUpperCase().trim();
  if (/^NC/.test(kind)) return -1;
  if (/^FC/.test(kind) || kind === 'COT') return 1;
  return 0;
}
export const SALE_TYPES = ['FCA', 'FCB', 'FCC', 'FCE', 'COT', 'NCA', 'NCB', 'NCC', 'NCE', 'NCT'];

const num = (...values) => {
  for (const value of values) {
    if (value === '' || value == null) continue;
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};
const text = (...values) => {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'object') { const inner = value.Nombre ?? value.nombre ?? value.Descripcion; if (inner) return String(inner).trim(); continue; }
    const out = String(value).trim();
    if (out) return out;
  }
  return '';
};
// Moneda (28/11, Felipe: «el ranking en dólares, cada venta en pesos dividida por el dólar del día que se facturó»).
// Cada comprobante trae IDMoneda (un id distinto por cuenta de Contabilium) y TipoDeCambio (el dólar de ese día).
// Ids de dólar comprobados el 28/11 con los importes (los de dólar tienen importes chicos): POLIPLAST 12756,
// FOAMFACTORY 14654, POLIOCHO 57213. COMARG factura solo en pesos.
export const USD_MONEDAS = new Set(['12756', '14654', '57213']);
const tcNumber = (value) => {
  const text = String(value ?? '').trim();
  const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  return Number.isFinite(parsed) && parsed > 100 ? parsed : null;
};
// Dólar de cada fecha según los comprobantes que lo traen (para los en pesos que vienen con TipoDeCambio 1).
export function dailyRates(list = []) {
  const byDate = new Map();
  for (const row of list) {
    const tc = tcNumber(row.tc);
    if (tc && row.fecha && !byDate.has(row.fecha)) byDate.set(row.fecha, tc);
  }
  return byDate;
}
export function rateFor(row = {}, rates = new Map()) {
  const own = tcNumber(row.tc);
  if (own) return own;
  if (rates.has(row.fecha)) return rates.get(row.fecha);
  const earlier = [...rates.keys()].filter((date) => date <= String(row.fecha || '')).sort().pop()
    || [...rates.keys()].sort()[0];
  return earlier ? rates.get(earlier) : null;
}

export const cleanCode = (code = '') => String(code).trim().toUpperCase().replace(/\s+/g, '');

// Renglones del detalle de un comprobante → filas de contabilium_items.
export function itemRows(comprobante = {}, detail = {}) {
  const items = Array.isArray(detail?.Items) ? detail.Items : Array.isArray(detail?.items) ? detail.items : Array.isArray(detail?.Detalle) ? detail.Detalle : [];
  const sign = saleSign(comprobante.tipo);
  const rows = [];
  items.forEach((item, index) => {
    const cantidad = num(item.Cantidad, item.cantidad, item.Cant);
    const unit = num(item.PrecioUnitario, item.Precio, item.precioUnitario, item.PrecioUnitarioNeto);
    const bonif = num(item.Bonificacion, item.bonificacion, item.Descuento) || 0;
    const net = num(item.ImporteNeto, item.SubtotalNeto, item.Subtotal, item.Importe, item.Total)
      ?? (cantidad != null && unit != null ? cantidad * unit * (1 - bonif / 100) : null);
    rows.push({
      company: comprobante.company,
      comprobante_id: String(comprobante.id),
      linea: index + 1,
      fecha: comprobante.fecha || null,
      tipo: comprobante.tipo || null,
      signo: sign,
      codigo: cleanCode(text(item.Codigo, item.codigo, item.CodigoConcepto, item.Concepto?.Codigo, item.Sku)) || null,
      nombre: text(item.Concepto, item.Descripcion, item.Nombre, item.descripcion).slice(0, 200) || null,
      cantidad: cantidad == null ? null : Math.abs(cantidad),
      neto: net == null ? null : Math.abs(Math.round(net * 100) / 100),
      rubro: text(item.Rubro, item.NombreRubro, item.Concepto?.Rubro).slice(0, 80) || null,
      subrubro: text(item.SubRubro, item.Subrubro, item.NombreSubRubro, item.Concepto?.SubRubro).slice(0, 80) || null,
      moneda: comprobante.moneda == null ? null : (USD_MONEDAS.has(String(comprobante.moneda)) ? 'USD' : 'ARS'),
      tc: comprobante.tcDay ?? null,
      canal: comprobante.canal || 'directo',
      neto_usd: net == null || comprobante.moneda == null ? null
        : USD_MONEDAS.has(String(comprobante.moneda)) ? Math.abs(Math.round(net * 100) / 100)
          : comprobante.tcDay ? Math.abs(Math.round((net / comprobante.tcDay) * 100) / 100) : null,
    });
  });
  return rows;
}

async function errorText(response) {
  const body = await response.json().catch(() => null);
  return body?.error_description || body?.Message || body?.message || body?.error || `HTTP ${response.status}`;
}

async function token(environment, key, http) {
  const id = environment[`CONTABILIUM_${key}_CLIENT_ID`];
  const secret = environment[`CONTABILIUM_${key}_CLIENT_SECRET`];
  if (!id || !secret) throw new Error('faltan las claves en Vercel');
  const response = await http(`${API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
  });
  if (!response.ok) throw new Error(`no aceptó las claves (${await errorText(response)})`);
  const body = await response.json();
  if (!body?.access_token) throw new Error('no devolvió un token');
  return body.access_token;
}

export function store(environment, http) {
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
  };
}

// Dos caminos posibles para el detalle; el que anda se recuerda mientras viva la función.
const DETAIL_PATHS = [(id) => `/api/comprobantes/${encodeURIComponent(id)}`, (id) => `/api/comprobantes/?id=${encodeURIComponent(id)}`];
let workingPath = null;
export function resetDetailPath() { workingPath = null; }

export async function fetchDetail(id, accessToken, http) {
  const order = workingPath == null ? [0, 1] : [workingPath];
  let last = '';
  for (const index of order) {
    const response = await http(`${API}${DETAIL_PATHS[index](id)}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (response.ok) {
      const body = await response.json().catch(() => null);
      const detail = Array.isArray(body) ? body[0] : body?.Items && !Array.isArray(body.Items) ? body.Items : body;
      if (detail && typeof detail === 'object') { workingPath = index; return detail; }
      last = 'respuesta vacía';
      continue;
    }
    last = `${response.status} ${await errorText(response)}`;
  }
  throw new Error(`detalle: ${last}`);
}

async function selectPages(db, path, maxPages = 10) {
  const out = [];
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await db.select(`${path}&limit=1000&offset=${page * 1000}`);
    out.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}

const monthsAgo = (now, months) => new Date(now - months * 30.5 * 86400000).toISOString().slice(0, 10);

// Una pasada para una empresa hasta `deadline`: pide los comprobantes de venta de los últimos `months` meses que
// todavía no se leyeron, de los más nuevos a los más viejos, de a `parallel`.
export async function syncItems(company, environment, http, db, { deadline, now = Date.now, months = 12, parallel = 3 } = {}) {
  const since = monthsAgo(now(), months);
  const types = SALE_TYPES.join(',');
  // 28/11: también las facturas de Mercado Libre (contabilium_comprobantes_ml), con canal 'ml'. Primero las más nuevas.
  // La base devuelve hasta 1000 filas por pedido: se pide por páginas (antes la lista de «ya leídos» se cortaba en 1000).
  const [direct, ml, seen] = await Promise.all([
    selectPages(db, `contabilium_comprobantes?select=company,id,tipo,fecha,moneda:raw->>IDMoneda,tc:raw->>TipoDeCambio&company=eq.${company}&tipo=in.(${types})&fecha=gte.${since}&order=fecha.desc,id`, 10),
    selectPages(db, `contabilium_comprobantes_ml?select=company,id,tipo,fecha,moneda,tc&company=eq.${company}&tipo=in.(${types})&fecha=gte.${since}&order=fecha.desc,id`, 60).catch(() => []),
    selectPages(db, `contabilium_items_seen?select=comprobante_id&company=eq.${company}&order=comprobante_id`, 80),
  ]);
  const list = [...(direct || []), ...(ml || []).map((row) => ({ ...row, canal: 'ml' }))].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const done = new Set((seen || []).map((row) => String(row.comprobante_id)));
  const rates = dailyRates(list || []);
  for (const row of list || []) row.tcDay = rateFor(row, rates);
  const pending = (list || []).filter((row) => !done.has(String(row.id)));
  const result = { company, pending: pending.length, read: 0, items: 0, errors: 0, lastError: null };
  if (!pending.length) return result;
  const accessToken = await token(environment, company, http);
  let cursor = 0;
  while (cursor < pending.length && now() < deadline) {
    const batch = pending.slice(cursor, cursor + parallel);
    cursor += batch.length;
    const outcomes = await Promise.all(batch.map(async (row) => {
      try {
        const detail = await fetchDetail(row.id, accessToken, http);
        return { row, rows: itemRows(row, detail) };
      } catch (error) {
        return { row, rows: [], error: String(error?.message || error).slice(0, 200) };
      }
    }));
    const items = outcomes.flatMap((outcome) => outcome.rows);
    await db.upsert('contabilium_items', items);
    // Un error de red no se marca como leído: se reintenta en la próxima pasada. Uno de «no existe» sí.
    const seenRows = outcomes.filter((outcome) => !outcome.error || /\b404\b/.test(outcome.error))
      .map((outcome) => ({ company, comprobante_id: String(outcome.row.id), items: outcome.rows.length, error: outcome.error || null, fetched_at: new Date(now()).toISOString() }));
    await db.upsert('contabilium_items_seen', seenRows);
    result.read += seenRows.length;
    result.items += items.length;
    const failed = outcomes.filter((outcome) => outcome.error);
    result.errors += failed.length;
    if (failed.length) result.lastError = failed[0].error;
    // Si los primeros fallan todos igual (camino o permiso), no seguir golpeando.
    if (result.read === 0 && result.errors >= parallel * 2) break;
  }
  result.pending -= result.read;
  return result;
}

export async function contabiliumItemsCron(request, environment = process.env, http = fetch, { now = Date.now } = {}) {
  const secret = environment.CRON_SECRET;
  if (!secret || !safeEqual(request.headers?.authorization || '', `Bearer ${secret}`)) return { status: 401, body: { error: 'No autorizado.' } };
  const db = store(environment, http);
  const started = now();
  const results = [];
  for (const company of ITEM_COMPANIES) {
    if (now() > started + 44000) break;
    try {
      results.push(await syncItems(company, environment, http, db, { deadline: Math.min(started + 46000, now() + 30000), now }));
    } catch (error) {
      results.push({ company, error: String(error?.message || error).slice(0, 200) });
    }
  }
  const ok = results.every((row) => !row.error && !(row.read === 0 && row.errors > 0));
  return { status: 200, body: { ok, results } };
}

// Botón para administradores: una pasada de una empresa (o la siguiente con pendientes) y el estado.
export async function contabiliumItemsAdmin(request, environment = process.env, http = fetch, { now = Date.now } = {}) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo administradores.' } };
  const db = store(environment, http);
  if (request.body?.op === 'sync') {
    const company = ITEM_COMPANIES.includes(request.body?.company) ? request.body.company : 'POLIPLAST';
    try {
      const state = await syncItems(company, environment, http, db, { deadline: now() + 38000, now });
      return { status: 200, body: { ok: !(state.read === 0 && state.errors > 0), ...state } };
    } catch (error) {
      return { status: 200, body: { ok: false, company, error: String(error?.message || error).slice(0, 200) } };
    }
  }
  return { status: 400, body: { error: 'Acción inválida.' } };
}
