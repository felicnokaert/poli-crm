import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWho, entregasApiHandler, keyIsValid, rangeOf, todayFilter } from '../lib/entregas-api.mjs';

const KEY = 'e'.repeat(32);
const env = { ENTREGAS_API_KEY: KEY, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' };
const CONFIG = [{ operadores: ['Marcos', 'Neyen'], depositos: ['Villa Domínico', 'Mar del Plata'] }];
const reply = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json, text: async () => JSON.stringify(json) });
const res = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
const NOW = () => Date.parse('2026-11-20T15:00:00Z');

function fakeHttp(extra = {}) {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('entregas_config')) return reply(200, CONFIG);
    if (url.includes('entregas_api_log')) return reply(201, null);
    if (url.includes('entregas_expresos')) return reply(200, [{ id: 'x1', nombre: 'OCA' }]);
    if (url.includes('entregas_pedidos')) return reply(200, [{ id: 'p1', cliente: 'Cliente', telefono: '11', expreso_id: 'x1', estado: 'impreso' }]);
    if (url.includes('rpc/entregas_cambiar_estado_expedicion')) return extra.rpc ? extra.rpc(options) : reply(200, { id: 'p1', estado: 'despachado' });
    return reply(404, {});
  };
  return { http, calls };
}

test('clave, rango y operario', () => {
  assert.ok(keyIsValid(KEY, env));
  assert.ok(!keyIsValid('corta', { ENTREGAS_API_KEY: 'corta' }));
  assert.deepEqual(rangeOf('2026-11-01', '2027-03-01'), { from: '2026-11-01', to: '2027-01-01' });
  assert.deepEqual(rangeOf('mal', '', NOW()), { from: '2026-11-20', to: '2026-11-20' });
  assert.deepEqual(checkWho(CONFIG[0], ' Marcos ', 'Villa Domínico'), { operador: 'Marcos', deposito: 'Villa Domínico' });
  assert.ok(checkWho(CONFIG[0], 'Pepe', 'Villa Domínico').error);
  assert.ok(checkWho(CONFIG[0], 'Marcos', 'Otro').error);
  assert.match(todayFilter('2026-11-20'), /fecha_despacho\.eq\.2026-11-20/);
});

test('sin clave 401, operario desconocido 400 y queda registrado', async () => {
  let r = res(); await entregasApiHandler({ method: 'GET', headers: {}, query: { entregas: 'hoy' } }, r, env, fakeHttp().http, NOW);
  assert.equal(r.code, 401);
  const { http, calls } = fakeHttp();
  r = res(); await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'hoy', operador: 'Pepe', deposito: 'Villa Domínico' } }, r, env, http, NOW);
  assert.equal(r.code, 400);
  assert.ok(calls.some((call) => call.url.includes('entregas_api_log') && call.options.body.includes('"ok":false')));
});

test('hoy devuelve los pedidos con el nombre del expreso y registra la consulta', async () => {
  const { http, calls } = fakeHttp();
  const r = res();
  await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'hoy', operador: 'Neyen', deposito: 'Mar del Plata' } }, r, env, http, NOW);
  assert.equal(r.code, 200);
  assert.equal(r.body.hoy, '2026-11-20');
  assert.equal(r.body.pedidos[0].expreso, 'OCA');
  const pedidosCall = calls.find((call) => call.url.includes('entregas_pedidos'));
  assert.match(pedidosCall.url, /estado=neq\.cancelado/);
  assert.ok(calls.some((call) => call.url.includes('entregas_api_log') && call.options.body.includes('Neyen')));
});

test('cambiar estado usa la función de expedición con operario y depósito; rechaza estados de otros roles', async () => {
  const { http, calls } = fakeHttp();
  let r = res();
  await entregasApiHandler({ method: 'POST', headers: { 'x-api-key': KEY }, query: { entregas: 'estado' }, body: { pedido: '11111111-1111-1111-1111-111111111111', estado: 'despachado', datos: { n_guia: '123', bultos: 2 }, operador: 'Marcos', deposito: 'Villa Domínico' } }, r, env, http, NOW);
  assert.equal(r.code, 200);
  const rpc = calls.find((call) => call.url.includes('rpc/entregas_cambiar_estado_expedicion'));
  const args = JSON.parse(rpc.options.body);
  assert.equal(args.p_operador, 'Marcos');
  assert.equal(args.p_deposito, 'Villa Domínico');
  assert.deepEqual(args.p_datos, { n_guia: '123', bultos: 2 });
  r = res();
  await entregasApiHandler({ method: 'POST', headers: { 'x-api-key': KEY }, query: { entregas: 'estado' }, body: { pedido: '11111111-1111-1111-1111-111111111111', estado: 'cancelado', operador: 'Marcos', deposito: 'Villa Domínico' } }, r, env, http, NOW);
  assert.equal(r.code, 400);
  const denied = fakeHttp({ rpc: () => reply(400, { message: 'No podés pasar este pedido de cargado a entregado' }) });
  r = res();
  await entregasApiHandler({ method: 'POST', headers: { 'x-api-key': KEY }, query: { entregas: 'estado' }, body: { pedido: '11111111-1111-1111-1111-111111111111', estado: 'entregado', operador: 'Marcos', deposito: 'Villa Domínico' } }, r, env, denied.http, NOW);
  assert.equal(r.code, 409);
  assert.match(r.body.error, /No podés pasar/);
});

const PID = '11111111-2222-3333-4444-555555555555';
function richHttp() {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('entregas_config')) return reply(200, CONFIG);
    if (url.includes('entregas_api_log')) return reply(201, null);
    if (url.includes('entregas_expresos')) return reply(200, [{ id: 'x1', nombre: 'OCA' }]);
    if (url.includes('entregas_pedidos')) return reply(200, [{ id: PID, cliente: 'Cliente', expreso_id: 'x1', estado: 'despachado' }]);
    if (url.includes('entregas_eventos')) return reply(200, [{ pedido_id: PID, a_estado: 'despachado', operador: 'Neyen', created_at: '2026-11-20T14:00:00Z' }]);
    if (url.includes('entregas_archivos')) return reply(200, [{ pedido_id: PID, tipo: 'guia', storage_path: `${PID}/guia-1.pdf` }, { pedido_id: PID, tipo: 'remito', storage_path: `${PID}/remito.pdf` }]);
    if (url.includes('/storage/v1/object/sign/')) return reply(200, { signedURL: '/object/sign/entregas/x?token=t' });
    return reply(404, {});
  };
  return { http, calls };
}

test('hoy suma quién despachó, cuándo y si tiene guía o comprobante', async () => {
  const { http } = richHttp();
  const r = res();
  await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'hoy', operador: 'Marcos', deposito: 'Villa Domínico' } }, r, env, http, NOW);
  assert.equal(r.code, 200);
  const [row] = r.body.pedidos;
  assert.equal(row.despacho_operador, 'Neyen');
  assert.equal(row.despacho_at, '2026-11-20T14:00:00Z');
  assert.equal(row.tiene_guia_archivo, true);
  assert.equal(row.tiene_comprobante, false);
  assert.equal(row.archivos, 2);
});

test('pedido: historial y archivos con link firmado, sin la ruta interna', async () => {
  const { http } = richHttp();
  const r = res();
  await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'pedido', id: PID, operador: 'Marcos', deposito: 'Villa Domínico' } }, r, env, http, NOW);
  assert.equal(r.code, 200);
  assert.equal(r.body.eventos.length, 1);
  assert.equal(r.body.archivos[0].url, 'https://x.supabase.co/storage/v1/object/sign/entregas/x?token=t');
  assert.equal(r.body.archivos[0].storage_path, undefined);
  const bad = res();
  await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'pedido', id: 'x', operador: 'Marcos', deposito: 'Villa Domínico' } }, bad, env, http, NOW);
  assert.equal(bad.code, 400);
});

test('operario de sistema «Resumen diario»: puede leer, no puede cambiar estados', async () => {
  const { http } = richHttp();
  const r = res();
  await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'hoy', operador: 'Resumen diario' } }, r, env, http, NOW);
  assert.equal(r.code, 200);
  const w = res();
  await entregasApiHandler({ method: 'POST', headers: { 'x-api-key': KEY }, query: { entregas: 'estado' }, body: { pedido: PID, estado: 'entregado', operador: 'Resumen diario', deposito: 'Todos' } }, w, env, http, NOW);
  assert.equal(w.code, 400);
  assert.match(w.body.error, /solo puede consultar/);
});

test('checkWho acepta el depósito y el operario sin tilde y devuelve el nombre de la lista', async () => {
  const { checkWho } = await import('../lib/entregas-api.mjs');
  const config = { operadores: ['Marcos', 'Jeremías'], depositos: ['Villa Domínico', 'Mar del Plata'] };
  assert.deepEqual(checkWho(config, 'jeremias', 'Villa Dominico'), { operador: 'Jeremías', deposito: 'Villa Domínico' });
  assert.ok(checkWho(config, 'Inventado', 'Villa Domínico').error);
  assert.ok(checkWho(config, 'Marcos', 'Berazategui').error);
});
