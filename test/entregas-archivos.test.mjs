import test from 'node:test';
import assert from 'node:assert/strict';
import { entregasApiHandler, checkUpload, uploadPath, validPath, MAX_BYTES } from '../lib/entregas-api.mjs';
import { emparejarArchivo, remitosDelTexto, sinRemitente, bultosDelTexto, candidatosPara } from '../lib/entregas-match.mjs';

const KEY = 'e'.repeat(32);
const env = { ENTREGAS_API_KEY: KEY, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' };
const CONFIG = [{ operadores: ['Marcos'], depositos: ['Villa Domínico'] }];
const reply = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json, text: async () => JSON.stringify(json) });
const res = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
const NOW = () => Date.parse('2026-11-21T15:00:00Z');
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const PEDIDOS = [
  { id: P1, codigo: 'E-1', cliente: 'Aislaciones del Sur SRL', cuit: '20-27421977-8', telefono: '0351 155 123456', direccion: 'Av. Colón 1234', n_remito: '0006-00006361', estado: 'despachado', n_guia: null, created_at: '2026-11-19' },
  { id: P2, codigo: 'E-2', cliente: 'Otra Empresa SA', cuit: '30-11111111-1', telefono: '11 4444 5555', direccion: 'Mitre 99', n_remito: '0006-00006400', estado: 'impreso', n_guia: null, created_at: '2026-11-20' },
];
const PATH = 'expedicion/2026-11-21/guia-1795000000000-abc12-guia_via_cargo.pdf';

function fakeHttp({ stored = true, pedidos = PEDIDOS } = {}) {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('entregas_config')) return reply(200, CONFIG);
    if (url.includes('entregas_api_log')) return reply(201, null);
    if (url.includes('/object/upload/sign/')) return reply(200, { url: '/object/upload/sign/entregas/x?token=tok123', token: 'tok123' });
    if (url.includes('/object/list/entregas')) return reply(200, stored ? [{ name: PATH.split('/').pop(), metadata: { size: 1200, mimetype: 'application/pdf' } }] : []);
    if (url.includes('/object/sign/entregas/')) return reply(200, { signedURL: '/object/sign/entregas/x?token=t' });
    if (url.includes('entregas_archivos_sin_asignar')) {
      if (options.method === 'POST') return reply(201, [{ id: 'sa-1', ...JSON.parse(options.body) }]);
      if (options.method === 'PATCH') return reply(200, [{}]);
      if (url.includes('id=eq.')) return reply(200, [{ id: 'sa-1', tipo: 'guia', nombre: 'g.pdf', storage_path: PATH, mime: 'application/pdf', tamano: 10, asignado_pedido: null, n_guia: '999' }]);
      if (url.includes('asignado_pedido=is.null')) return reply(200, [{ id: 'sa-1', tipo: 'guia', storage_path: PATH, candidatos: [] }]);
      return reply(200, []);
    }
    if (url.includes('entregas_archivos')) {
      if (options.method === 'POST') return reply(201, [{ id: 'arch-1', ...JSON.parse(options.body) }]);
      return reply(200, []);
    }
    if (url.includes('entregas_pedidos')) {
      if (url.includes('id=eq.')) return reply(200, pedidos.filter((p) => url.includes(p.id)).map((p) => ({ id: p.id, estado: p.estado })));
      return reply(200, pedidos);
    }
    return reply(404, {});
  };
  return { http, calls };
}
const post = (route, body) => ({ method: 'POST', headers: { 'x-api-key': KEY }, query: { entregas: route }, body: { operador: 'Marcos', deposito: 'Villa Domínico', ...body } });

test('límites de subida y caminos válidos', () => {
  assert.equal(checkUpload({ nombre: 'a.pdf', mime: 'application/pdf', bytes: 1000, tipo: 'guia' }), null);
  assert.match(checkUpload({ nombre: 'a.exe', mime: 'application/x-msdownload', bytes: 10, tipo: 'guia' }), /PDF/);
  assert.match(checkUpload({ nombre: 'a.pdf', mime: 'application/pdf', bytes: MAX_BYTES + 1, tipo: 'guia' }), /15 MB/);
  assert.match(checkUpload({ nombre: 'a.pdf', mime: 'application/pdf', bytes: 1, tipo: 'factura' }), /Tipo/);
  const path = uploadPath('guia', 'Guía Vía Cargo (1).pdf', '2026-11-21', 1795000000000, () => 0.5);
  assert.ok(validPath(path), path);
  assert.ok(!validPath('otro/../../secreto.pdf'));
  assert.ok(!validPath('P1/guia.pdf'));
});

test('emparejado: ignora los datos de Poliplast y el remito del expreso', () => {
  const texto = 'REMITENTE: POLIURETANO Y PLASTICO PROYECTADO CUIT 30715764845 TEL 11 6638-2693\nREMITO 5526-72357\nDESTINATARIO CT 20274219778\nCANTIDAD DE BULTO/S: 4';
  assert.ok(!/30715764845/.test(sinRemitente(texto)));
  assert.equal(remitosDelTexto(texto).size, 0);
  const match = emparejarArchivo(texto, PEDIDOS);
  assert.equal(match.por, 'cuit');
  assert.deepEqual(match.pedidos.map((p) => p.id), [P1]);
  assert.equal(bultosDelTexto(texto), 4);
  assert.equal(emparejarArchivo('Remito/s Nro: 0006-00006400', PEDIDOS).pedidos[0].id, P2);
  // Si solo aparece Poliplast, no se asigna a nadie.
  assert.equal(emparejarArchivo('POLIPLAST CUIT 30715764845 tel 1166382693', PEDIDOS), null);
  assert.equal(candidatosPara('guia', [{ estado: 'impreso', n_guia: '1' }, { estado: 'cancelado' }, { estado: 'impreso' }]).length, 1);
});

test('subir-url devuelve el link firmado; el operario de sistema no puede subir', async () => {
  const { http } = fakeHttp();
  let r = res();
  await entregasApiHandler(post('subir-url', { nombre: 'g.pdf', mime: 'application/pdf', bytes: 1200, tipo: 'guia' }), r, env, http, NOW);
  assert.equal(r.code, 200);
  assert.ok(validPath(r.body.path));
  assert.equal(r.body.token, 'tok123');
  assert.match(r.body.url, /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/upload\/sign\//);
  r = res();
  await entregasApiHandler(post('subir-url', { operador: 'Resumen diario', deposito: 'Todos', nombre: 'g.pdf', mime: 'application/pdf', bytes: 1, tipo: 'guia' }), r, env, http, NOW);
  assert.equal(r.code, 400);
});

test('registrar-archivo: asigna solo por CUIT único y anota operario y depósito', async () => {
  const { http, calls } = fakeHttp();
  const r = res();
  await entregasApiHandler(post('registrar-archivo', { path: PATH, tipo: 'guia', pedido: null, nombre: 'g.pdf', texto: 'DESTINATARIO CT 20274219778' }), r, env, http, NOW);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.asignado_a, P1);
  const insert = calls.find((c) => c.url.endsWith('/entregas_archivos') && c.options.method === 'POST');
  const row = JSON.parse(insert.options.body);
  assert.equal(row.pedido_id, P1);
  assert.equal(row.operador, 'Marcos');
  assert.equal(row.deposito, 'Villa Domínico');
  assert.equal(row.storage_path, PATH);
});

test('registrar-archivo: sin coincidencia segura queda sin asignar con candidatos', async () => {
  const { http, calls } = fakeHttp();
  const r = res();
  await entregasApiHandler(post('registrar-archivo', { path: PATH, tipo: 'guia', texto: 'Destinatario: Otra Empresa SA' }), r, env, http, NOW);
  assert.equal(r.code, 200);
  assert.equal(r.body.asignado_a, null);
  assert.equal(r.body.archivo_id, 'sa-1');
  assert.equal(r.body.candidatos[0].pedido, P2);
  assert.equal(r.body.candidatos[0].por, 'razon');
  assert.ok(!calls.some((c) => c.url.endsWith('/entregas_archivos') && c.options.method === 'POST'));
});

test('registrar-archivo: rechaza caminos inventados y archivos no subidos', async () => {
  let r = res();
  await entregasApiHandler(post('registrar-archivo', { path: 'otro/x.pdf', tipo: 'guia' }), r, env, fakeHttp().http, NOW);
  assert.equal(r.code, 400);
  r = res();
  await entregasApiHandler(post('registrar-archivo', { path: PATH, tipo: 'guia' }), r, env, fakeHttp({ stored: false }).http, NOW);
  assert.equal(r.code, 400);
  assert.match(r.body.error, /no está subido/);
});

test('sin-asignar lista con link firmado y asignar lo pasa al pedido', async () => {
  const { http, calls } = fakeHttp();
  let r = res();
  await entregasApiHandler({ method: 'GET', headers: { 'x-api-key': KEY }, query: { entregas: 'sin-asignar', operador: 'Marcos', deposito: 'Villa Domínico' } }, r, env, http, NOW);
  assert.equal(r.code, 200);
  assert.equal(r.body.archivos.length, 1);
  assert.equal(r.body.archivos[0].storage_path, undefined);
  assert.match(r.body.archivos[0].url, /object\/sign/);
  r = res();
  await entregasApiHandler(post('asignar', { archivo_id: '33333333-3333-4333-8333-333333333333', pedido: P2 }), r, env, http, NOW);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.asignado_a, P2);
  const patch = calls.find((c) => c.url.includes('entregas_archivos_sin_asignar') && c.options.method === 'PATCH');
  assert.equal(JSON.parse(patch.options.body).asignado_pedido, P2);
});

test('registrar-archivo con nota la deja como comentario en el historial', async () => {
  const { http, calls } = fakeHttp();
  const r = res();
  await entregasApiHandler(post('registrar-archivo', { path: PATH, tipo: 'remito_firmado', pedido: P1, nota: 'Firmó el retiro: Juan Pérez, DNI 27421977 (firma digital).' }), r, env, http, NOW);
  assert.equal(r.code, 200);
  const evento = calls.find((c) => c.url.includes('entregas_eventos') && c.options.method === 'POST');
  const row = JSON.parse(evento.options.body);
  assert.equal(row.tipo, 'comentario');
  assert.equal(row.pedido_id, P1);
  assert.match(row.nota, /DNI 27421977/);
  assert.equal(row.operador, 'Marcos');
});
