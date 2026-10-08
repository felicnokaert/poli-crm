import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { buildPublicSnapshot, esPersonaFisica, generateShareToken, hashTokenHex } from '../src/map-share.mjs';
import { fetchSnapshotByToken, hashShareToken, isValidShareToken } from '../lib/map-share.mjs';
import handler from '../api/mapa-publico.js';

const cliente = (extra = {}) => ({
  doc: '30709718661', cuit: '30-70971866-1', tipo_doc: 'CUIT', razon_social: 'ACME SRL',
  email: 'secreto@acme.com', telefono: '1155551234', domicilio: 'Calle Falsa 123', cp: '1000',
  provincia_cod: '06', provincia: 'Buenos Aires', localidad: 'Mar del Plata',
  compro: true, ultima_compra: '2026-09-20', n_facturas: 7, n_cotizaciones: 2, ultima_cotizacion: '2026-09-01',
  productos: [{ producto: '618 SP', veces: 3, kg: 660, ultima: '2026-09-20' }],
  es_aplicador: 'si', tipo: 'aplicador', tipo_auto: 'aplicador', tipo_origen: 'manual', tipo_nota: 'nota interna',
  lat: -38, lon: -57.5, depto_id: '06357', precision: 'localidad', motivo_aprox: null, ...extra,
});

test('generateShareToken: 43 caracteres base64url, distinto cada vez, y lo acepta el servidor', () => {
  const a = generateShareToken(webcrypto);
  const b = generateShareToken(webcrypto);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(isValidShareToken(a), true);
  assert.equal(isValidShareToken('corto'), false);
  assert.equal(isValidShareToken(undefined), false);
  assert.equal(isValidShareToken('../../etc/passwd'.padEnd(43, 'a')), false);
});

test('el hash del navegador y el del servidor coinciden', async () => {
  const token = generateShareToken(webcrypto);
  assert.equal(await hashTokenHex(token, webcrypto), hashShareToken(token));
});

test('buildPublicSnapshot, sin tildar nada, NO expone CUIT, telefono, email, domicilio ni notas internas', () => {
  const snap = buildPublicSnapshot([cliente()], { nombres: true, productos: true });
  const texto = JSON.stringify(snap);
  for (const secreto of ['30709718661', '30-70971866-1', 'secreto@acme.com', '1155551234', 'Calle Falsa', 'nota interna']) {
    assert.equal(texto.includes(secreto), false, `se filtro: ${secreto}`);
  }
  assert.equal(snap.clientes[0].doc, 'p1'); // id opaco
  assert.equal(snap.clientes[0].razon_social, 'ACME SRL');
  assert.deepEqual(snap.publico, { nombres: true, productos: true, cuit: false, telefono: false });
});

test('buildPublicSnapshot: solo compradores ubicados; prospectos y sin lat no entran', () => {
  const snap = buildPublicSnapshot([
    cliente(), cliente({ compro: false }), cliente({ lat: null, lon: null }), cliente({ cuit: '30111111111', razon_social: 'OTRA SA' }),
  ]);
  assert.equal(snap.clientes.length, 2);
});

test('buildPublicSnapshot: sin opcion de productos no salen productos, kilos ni facturas', () => {
  const snap = buildPublicSnapshot([cliente()], { productos: false });
  assert.deepEqual(snap.clientes[0].productos, []);
  assert.equal(snap.clientes[0].n_facturas, 0);
  assert.equal(JSON.stringify(snap).includes('660'), false);
});

test('buildPublicSnapshot: nombres apagados, y personas fisicas ocultas por defecto', () => {
  const persona = cliente({ doc: '20123456786', razon_social: 'JUAN PEREZ' });
  const empresa = cliente({ doc: '30709718661', razon_social: 'EMPRESA SA' });
  const porDefecto = buildPublicSnapshot([persona, empresa]);
  assert.equal(porDefecto.clientes[0].razon_social, 'Aplicador 1'); // persona fisica oculta
  assert.equal(porDefecto.clientes[1].razon_social, 'EMPRESA SA');
  assert.equal(JSON.stringify(porDefecto).includes('JUAN PEREZ'), false);
  const conPersonas = buildPublicSnapshot([persona], { nombresPersonas: true });
  assert.equal(conPersonas.clientes[0].razon_social, 'JUAN PEREZ');
  const sinNombres = buildPublicSnapshot([empresa], { nombres: false });
  assert.equal(sinNombres.clientes[0].razon_social, 'Aplicador 1');
  assert.equal(esPersonaFisica({ doc: '30709718661', tipo_doc: 'CUIT' }), false);
  assert.equal(esPersonaFisica({ doc: '27123456789', tipo_doc: 'CUIT' }), true);
  assert.equal(esPersonaFisica({ doc: '12345678', tipo_doc: 'DNI' }), true);
});

test('buildPublicSnapshot: solo aplicadores filtra por tipo', () => {
  const snap = buildPublicSnapshot([cliente(), cliente({ tipo: 'inyeccion' }), cliente({ tipo: null })], { soloAplicadores: true });
  assert.equal(snap.clientes.length, 1);
  assert.equal(snap.clientes[0].tipo, 'aplicador');
});

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };

test('fetchSnapshotByToken consulta por hash, exige no revocado y devuelve la foto', async () => {
  const token = generateShareToken(webcrypto);
  let pedido;
  const fetchImpl = async (url, init) => {
    pedido = { url, init };
    return { ok: true, json: async () => [{ snapshot: { clientes: [], fecha_export: '2026-10-08' } }] };
  };
  const snap = await fetchSnapshotByToken(ENV, token, fetchImpl);
  assert.equal(snap.fecha_export, '2026-10-08');
  assert.ok(pedido.url.includes(`token_hash=eq.${hashShareToken(token)}`));
  assert.ok(pedido.url.includes('revoked_at=is.null'));
  assert.equal(pedido.url.includes(token), false); // el link en claro nunca viaja a la base
});

test('fetchSnapshotByToken: token invalido no toca la base; sin filas devuelve null', async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas += 1; return { ok: true, json: async () => [] }; };
  assert.equal(await fetchSnapshotByToken(ENV, 'malo', fetchImpl), null);
  assert.equal(llamadas, 0);
  assert.equal(await fetchSnapshotByToken(ENV, generateShareToken(webcrypto), fetchImpl), null);
  assert.equal(llamadas, 1);
});

function fakeResponse() {
  const res = { headers: {}, statusCode: 200, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('api/mapa-publico: solo GET, token invalido responde 404 y nunca cachea', async () => {
  const post = fakeResponse();
  await handler({ method: 'POST', query: {} }, post);
  assert.equal(post.statusCode, 405);
  const malo = fakeResponse();
  await handler({ method: 'GET', query: { t: 'cualquiera' } }, malo);
  assert.equal(malo.statusCode, 404);
  assert.match(malo.headers['Cache-Control'], /no-store/);
  assert.match(malo.headers['X-Robots-Tag'], /noindex/);
});

// ---- CUIT y teléfono: solo si quien publica los tilda ----
test('por defecto el CUIT y el teléfono NO salen (cuit/telefono apagados)', () => {
  const snap = buildPublicSnapshot([cliente()], { nombres: true });
  assert.equal(snap.clientes[0].cuit, '');
  assert.equal(snap.clientes[0].telefono, '');
  assert.deepEqual(snap.publico, { nombres: true, productos: false, cuit: false, telefono: false });
});

test('con cuit y telefono tildados salen para EMPRESAS, y nunca email, domicilio ni notas', () => {
  const empresa = cliente({ doc: '30709718661', cuit: '30-70971866-1', telefono: '1155551234' });
  const snap = buildPublicSnapshot([empresa], { cuit: true, telefono: true });
  assert.equal(snap.clientes[0].cuit, '30-70971866-1');
  assert.equal(snap.clientes[0].tipo_doc, 'CUIT');
  assert.equal(snap.clientes[0].telefono, '1155551234');
  assert.equal(snap.clientes[0].doc, 'p1'); // la identidad en la foto sigue siendo opaca
  assert.deepEqual(snap.publico, { nombres: true, productos: false, cuit: true, telefono: true });
  const texto = JSON.stringify(snap);
  for (const secreto of ['secreto@acme.com', 'Calle Falsa', 'nota interna']) assert.equal(texto.includes(secreto), false, `se filtró: ${secreto}`);
});

test('se pueden publicar solo el CUIT o solo el teléfono', () => {
  const soloCuit = buildPublicSnapshot([cliente()], { cuit: true });
  assert.equal(soloCuit.clientes[0].cuit, '30-70971866-1');
  assert.equal(soloCuit.clientes[0].telefono, '');
  const soloTel = buildPublicSnapshot([cliente()], { telefono: true });
  assert.equal(soloTel.clientes[0].cuit, '');
  assert.equal(soloTel.clientes[0].telefono, '1155551234');
});

test('CUIT y teléfono de PERSONAS FÍSICAS requieren la tilda aparte (datosPersonas)', () => {
  const persona = cliente({ doc: '20123456786', cuit: '20-12345678-6', tipo_doc: 'CUIT', razon_social: 'JUAN PEREZ', telefono: '1166667777' });
  const sinTilda = buildPublicSnapshot([persona], { cuit: true, telefono: true });
  assert.equal(sinTilda.clientes[0].cuit, '');
  assert.equal(sinTilda.clientes[0].telefono, '');
  assert.equal(JSON.stringify(sinTilda).includes('20-12345678-6'), false);
  assert.equal(JSON.stringify(sinTilda).includes('1166667777'), false);
  const conTilda = buildPublicSnapshot([persona], { cuit: true, telefono: true, datosPersonas: true });
  assert.equal(conTilda.clientes[0].cuit, '20-12345678-6');
  assert.equal(conTilda.clientes[0].telefono, '1166667777');
  assert.equal(conTilda.clientes[0].razon_social, 'Aplicador 1'); // el nombre sigue oculto: es otra opción
});
