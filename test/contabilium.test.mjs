import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, comprobanteRow, contabiliumAdmin, contabiliumCron, HISTORY_START } from '../lib/contabilium.mjs';

const env = {
  SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'svc', CRON_SECRET: 'cron',
  CONTABILIUM_POLIPLAST_CLIENT_ID: 'a', CONTABILIUM_POLIPLAST_CLIENT_SECRET: 'b',
};
const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => null } });
const NOW = Date.parse('2026-10-21T15:00:00Z');

// Contabilium falso: 120 comprobantes el 2024-05-10 (3 páginas) y 1 el día de hoy.
function fakeWorld({ email = 'felipe@grupopoliplast.com.ar', state = null, crowded = false } = {}) {
  const sync = state ? [state] : [];
  const rows = new Map();
  const searches = [];
  const http = async (url, options = {}) => {
    if (url.endsWith('/auth/v1/user')) return json({ id: 'u1', email });
    if (url === 'https://rest.contabilium.com/token') return json({ access_token: 'T' });
    if (url.startsWith('https://rest.contabilium.com/api/comprobantes/search')) {
      const query = new URL(url).searchParams;
      const from = query.get('fechaDesde');
      const to = query.get('fechaHasta');
      const page = Number(query.get('page'));
      searches.push({ from, to, page });
      const all = [];
      if (from <= '2024-05-10' && to >= '2024-05-10') for (let i = 0; i < 120; i += 1) all.push({ Id: 5000 + i, TipoFc: 'FCB', FechaEmision: '2024-05-10T00:00:00', Total: 100, RazonSocial: ' Cliente ' });
      if (to >= '2026-10-21') all.push({ Id: 9999, TipoFc: 'NCB', FechaEmision: '2026-10-21T10:00:00', Total: -50, Saldo: 0 });
      const totalPages = crowded && to > from ? 40 : Math.max(1, Math.ceil(all.length / 50));
      return json({ Items: all.slice((page - 1) * 50, page * 50), TotalItems: all.length, TotalPage: totalPages });
    }
    if (url.startsWith('https://db/rest/v1/contabilium_sync?select=*')) return json(sync);
    if (url.startsWith('https://db/rest/v1/contabilium_comprobantes') && options.method === 'HEAD') return { ok: true, status: 200, headers: { get: () => `0-0/${rows.size}` } };
    if (url === 'https://db/rest/v1/contabilium_sync' && options.method === 'POST') { const [row] = JSON.parse(options.body); sync.splice(0, sync.length, row); return json(null, 201); }
    if (url === 'https://db/rest/v1/contabilium_comprobantes' && options.method === 'POST') { for (const row of JSON.parse(options.body)) rows.set(`${row.company}:${row.id}`, row); return json(null, 201); }
    return json({ error: 'no' }, 404);
  };
  return { http, sync, rows, searches };
}
const req = (body) => ({ headers: { authorization: 'Bearer t' }, body: { action: 'contabilium', ...body } });
const options = { now: () => NOW, pause: 0 };

test('comprobanteRow guarda el encabezado y descarta lo que no tiene id', () => {
  const row = comprobanteRow({ Id: 7, TipoFc: 'FCA', Numero: '0001-00000007', FechaEmision: '2025-03-04T00:00:00', IdCliente: 3, RazonSocial: ' ACME ', Total: '1210.5', Saldo: 0 }, 'POLIPLAST');
  assert.deepEqual({ ...row, raw: undefined, synced_at: undefined }, { company: 'POLIPLAST', id: '7', tipo: 'FCA', numero: '0001-00000007', fecha: '2025-03-04', cliente_id: '3', cliente: 'ACME', total: 1210.5, saldo: 0, raw: undefined, synced_at: undefined });
  assert.equal(comprobanteRow({ TipoFc: 'FCA' }, 'POLIPLAST'), null);
  assert.equal(comprobanteRow({ Id: 8, TipoFc: 'FCB', Origen: 'MercadoLibre' }, 'COMARG'), null, 'lo de Mercado Libre ya está en su panel');
  assert.equal(comprobanteRow({ Id: 9, TipoFc: 'FCB', Origen: 'MercadoPago' }, 'COMARG'), null);
});

test('comprobanteRow entiende los importes en formato argentino ("39.025,52")', () => {
  const row = comprobanteRow({ Id: 10, TipoFc: 'FCB', FechaEmision: '2026-10-20', RazonSocial: 'ACME', ImporteTotalNeto: '39.025,52', Saldo: '1.000,50' }, 'COMARG');
  assert.equal(row.total, 39025.52);
  assert.equal(row.saldo, 1000.5);
});

test('una memoria a medio camino sigue desde su fecha', async () => {
  const world = fakeWorld({ state: { company: 'POLIPLAST', cursor_date: '2020-06-09', window_days: 4, page: 1, history_done: false, total_saved: 209 } });
  await contabiliumAdmin(req({ op: 'sync', company: 'POLIPLAST' }), env, world.http, options);
  assert.equal(world.searches[0].from, '2020-06-09');
});

test('si Contabilium no contesta a tiempo, corta y la próxima pasada reintenta el mismo tramo', async () => {
  const world = fakeWorld({ state: { company: 'POLIPLAST', cursor_date: '2024-04-01', window_days: 92, page: 2, history_done: false, total_saved: 0 } });
  const http = async (url, options) => (url.includes('/comprobantes/search') ? Promise.reject(new Error('timeout')) : world.http(url, options));
  const result = await contabiliumAdmin(req({ op: 'sync', company: 'POLIPLAST' }), env, http, options);
  assert.equal(result.status, 200);
  assert.equal(world.sync[0].cursor_date, '2024-04-01');
  assert.equal(world.sync[0].page, 2);
});

test('solo Felipe usa Contabilium', async () => {
  assert.equal((await contabiliumAdmin(req({ op: 'status' }), env, fakeWorld({ email: 'juan@grupopoliplast.com.ar' }).http, options)).status, 403);
});

test('trae el historial completo desde el principio, con todas las páginas, y deja la memoria', async () => {
  const world = fakeWorld();
  const result = await contabiliumAdmin(req({ op: 'sync', company: 'POLIPLAST' }), env, world.http, options);
  assert.equal(result.status, 200);
  assert.equal(result.body.company.done, true);
  assert.equal(world.rows.size, 121);
  assert.equal(world.searches[0].from, HISTORY_START);
  assert.ok(world.searches.every((search) => addDays(search.from, 91) >= search.to), 'tramos de 92 días como máximo');
  assert.deepEqual(world.searches.filter((search) => search.from <= '2024-05-10' && search.to >= '2024-05-10').map((search) => search.page), [1, 2, 3]);
  assert.equal(world.sync[0].history_done, true);
  assert.equal(world.sync[0].cursor_date, '2026-10-21');
  assert.equal(world.sync[0].total_saved, 121);
});

test('sigue donde quedó: con el historial completo solo relee la última semana', async () => {
  const world = fakeWorld({ state: { company: 'POLIPLAST', cursor_date: '2026-10-20', window_days: 92, page: 1, history_done: true, total_saved: 121 } });
  await contabiliumAdmin(req({ op: 'sync', company: 'POLIPLAST' }), env, world.http, options);
  assert.deepEqual(world.searches, [{ from: '2026-10-14', to: '2026-10-21', page: 1 }]);
});

test('si el tiempo se acaba, guarda tramo y página para la próxima', async () => {
  let calls = 0;
  const world = fakeWorld({ state: { company: 'POLIPLAST', cursor_date: '2024-04-01', window_days: 92, page: 1, history_done: false, total_saved: 0 } });
  const now = () => { calls += 1; return calls > 4 ? NOW + 60000 : NOW; };
  await contabiliumAdmin(req({ op: 'sync', company: 'POLIPLAST' }), env, world.http, { now, pause: 0 });
  assert.equal(world.sync[0].cursor_date, '2024-04-01');
  assert.equal(world.sync[0].page, 2);
  assert.equal(world.sync[0].history_done, false);
});

test('un tramo con demasiadas páginas se achica antes de leerlo', async () => {
  const world = fakeWorld({ crowded: true, state: { company: 'POLIPLAST', cursor_date: '2026-10-01', window_days: 92, page: 1, history_done: false, total_saved: 0 } });
  await contabiliumAdmin(req({ op: 'sync', company: 'POLIPLAST' }), env, world.http, options);
  assert.equal(world.searches[0].to, '2026-10-21');
  assert.ok(world.searches.some((search) => search.from === search.to), 'bajó hasta tramos de un día');
  assert.equal(world.sync[0].history_done, true);
});

test('cron: pide la clave y avisa de la empresa sin claves', async () => {
  assert.equal((await contabiliumCron({ headers: {} }, env, fakeWorld().http, options)).status, 401);
  const result = await contabiliumCron({ headers: { authorization: 'Bearer cron' } }, env, fakeWorld().http, options);
  assert.equal(result.status, 200);
  assert.equal(result.body.results.find((row) => row.company === 'COMARG').error, 'faltan las claves en Vercel');
});

test('fichas de clientes: con la lista completa, pide de a uno los que facturaron y no vinieron', async () => {
  const { syncClients, missingClientIds } = await import('../lib/contabilium.mjs');
  const sync = [{ company: 'POLIPLAST:clientes', page: 1, history_done: true, total_saved: 1 }];
  const clientes = new Map([['1', { id: '1' }]]);
  const asked = [];
  const http = async (url, options = {}) => {
    if (url === 'https://rest.contabilium.com/token') return json({ access_token: 'T' });
    if (url.startsWith('https://rest.contabilium.com/api/clientes/search')) { asked.push('lista'); return json({ Items: [] }); }
    const one = /api\/clientes\/(\d+)$/.exec(url);
    if (one) { asked.push(one[1]); return one[1] === '3' ? json({ error: 'no' }, 404) : json({ Id: Number(one[1]), RazonSocial: 'ACME', NroDoc: '30-71234567-8', Telefono: '11 4444-5555' }); }
    if (url.startsWith('https://db/rest/v1/contabilium_sync?select=*')) return json(sync);
    if (url.startsWith('https://db/rest/v1/contabilium_comprobantes?select=cliente_id')) return json(new URL(url).searchParams.get('offset') === '0' ? [{ cliente_id: '1' }, { cliente_id: '2' }, { cliente_id: '2' }, { cliente_id: '3' }] : []);
    if (url.startsWith('https://db/rest/v1/contabilium_clientes?select=id')) return options.method === 'HEAD' ? { ok: true, status: 200, headers: { get: () => `0-0/${clientes.size}` } } : json(new URL(url).searchParams.get('offset') === '0' ? [...clientes.values()].map((row) => ({ id: row.id })) : []);
    if (url === 'https://db/rest/v1/contabilium_sync' && options.method === 'POST') { sync.splice(0, 1, JSON.parse(options.body)[0]); return json(null, 201); }
    if (url === 'https://db/rest/v1/contabilium_clientes' && options.method === 'POST') { for (const row of JSON.parse(options.body)) clientes.set(row.id, row); return json(null, 201); }
    return json({ error: 'no' }, 404);
  };
  const store = { select: async (path) => (await http(`https://db/rest/v1/${path}`)).json(), count: async () => clientes.size, upsert: async (table, rows) => http(`https://db/rest/v1/${table}`, { method: 'POST', body: JSON.stringify(rows) }) };
  const state = await syncClients({ key: 'POLIPLAST' }, env, http, store, { deadline: NOW + 1000, now: () => NOW, pause: 0 });
  assert.deepEqual(asked, ['2', '3'], 'no relee la lista mientras falten fichas');
  assert.equal(clientes.get('2').cuit, '30712345678');
  assert.equal(clientes.get('3').raw.notFound, true, 'el que no existe queda marcado para no pedirlo otra vez');
  assert.equal(state.missing_left, 0);
  assert.deepEqual(await missingClientIds('POLIPLAST', store), []);
});
