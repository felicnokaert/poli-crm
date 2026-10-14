import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, normalizeOverpass, safeWord, searchOverpass } from '../lib/prospect-osm.mjs';
import handler from '../api/prospeccion.js';

// Forma de respuesta de Overpass (nodes con lat/lon, ways con center). Es un
// ejemplo armado a mano para probar el código; NO es una respuesta real del servicio.
const SAMPLE = {
  elements: [
    { type: 'node', id: 1, lat: -31.73, lon: -60.52, tags: { name: 'Ferretería El Clavo', shop: 'hardware', phone: '+54 343 4231234; +54 343 4000000', website: 'https://elclavo.com.ar', 'addr:street': 'San Martín', 'addr:housenumber': '123' } },
    { type: 'way', id: 2, center: { lat: -31.74, lon: -60.53 }, tags: { name: 'Corralón Norte', shop: 'doityourself', 'contact:email': 'ventas@norte.com', 'contact:instagram': 'corralonnorte', 'addr:city': 'Paraná' } },
    { type: 'node', id: 3, lat: -31.7, lon: -60.5, tags: { shop: 'hardware' } },
    { type: 'node', id: 1, lat: -31.73, lon: -60.52, tags: { name: 'Ferretería El Clavo', shop: 'hardware' } },
  ],
};

test('la consulta usa el radio, las etiquetas del rubro y las palabras del nombre', () => {
  const query = buildOverpassQuery({ lat: -31.73, lon: -60.52, radiusKm: 12, rubros: ['ferretería', 'corralón', 'carrocería'] });
  assert.match(query, /^\[out:json\]\[timeout:25\];/);
  assert.match(query, /nwr\["shop"="hardware"\]\(around:12000,-31\.73000,-60\.52000\);/);
  assert.match(query, /nwr\["shop"="doityourself"\]/);
  assert.match(query, /nwr\["name"~"ferreteria\|corralon\|carroceria",i\]/);
  assert.match(query, /out center tags 200;$/);
});

test('los rubros se sanean: nada que pueda romper la consulta', () => {
  assert.equal(safeWord('ferretería"]; out;'), 'ferretería out');
  const query = buildOverpassQuery({ lat: -31, lon: -60, radiusKm: 5, rubros: ['a"b\\c', '$(x)'] });
  assert.ok(!query.includes('\\') && !query.includes('$'));
  assert.match(query, /nwr\["name"~"a b c\|x",i\]/);
});

test('el radio queda acotado entre 1 y 30 km', () => {
  assert.match(buildOverpassQuery({ lat: -31, lon: -60, radiusKm: 500, rubros: ['ferretería'] }), /around:30000/);
  assert.match(buildOverpassQuery({ lat: -31, lon: -60, radiusKm: 0.1, rubros: ['ferretería'] }), /around:1000/);
});

test('normaliza la respuesta: descarta sin nombre y repetidos, y toma el primer teléfono', () => {
  const results = normalizeOverpass(SAMPLE, { zoneName: 'Paraná', province: 'Entre Ríos', family: 'Penosil' });
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    company: 'Ferretería El Clavo', family: 'Penosil', rubro: 'ferretería', address: 'San Martín 123', city: 'Paraná', province: 'Entre Ríos',
    phone: '+54 343 4231234', website: 'https://elclavo.com.ar', email: '', instagram: '', facebook: '', lat: -31.73, lon: -60.52, osmId: 'node/1', source: 'OpenStreetMap',
  });
  assert.equal(results[1].osmId, 'way/2');
  assert.equal(results[1].lat, -31.74);
  assert.equal(results[1].email, 'ventas@norte.com');
  assert.equal(results[1].instagram, 'corralonnorte');
});

test('si el primer servidor falla pasa al segundo; si fallan todos devuelve un mensaje claro', async () => {
  const calls = [];
  const http = async (url) => { calls.push(url); return calls.length === 1 ? { ok: false, status: 504, json: async () => ({}) } : { ok: true, status: 200, json: async () => SAMPLE }; };
  const ok = await searchOverpass('q', http, ['https://a', 'https://b']);
  assert.equal(ok.ok, true);
  assert.deepEqual(calls, ['https://a', 'https://b']);
  const down = await searchOverpass('q', async () => { throw new Error('timeout'); }, ['https://a']);
  assert.equal(down.ok, false);
  assert.match(down.error, /No se pudo consultar OpenStreetMap \(timeout\)/);
});

function response() {
  const out = { statusCode: 0, body: null };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  return out;
}

test('el endpoint exige usuario corporativo y valida zona y rubros', async () => {
  const original = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: 'marketing@grupopoliplast.com.ar' }) };
    return { ok: true, status: 200, json: async () => SAMPLE };
  };
  try {
    const call = async (body, authorization = 'Bearer ok') => { const res = response(); await handler({ method: 'POST', headers: { authorization }, body }, res); return res; };
    assert.equal((await call({}, '')).statusCode, 401);
    assert.equal((await call({ lat: 10, lon: 10, rubros: ['ferretería'] })).statusCode, 400, 'fuera de Argentina');
    assert.equal((await call({ lat: -31.7, lon: -60.5, rubros: [] })).statusCode, 400, 'sin rubros');
    const good = await call({ lat: -31.7, lon: -60.5, population: 250000, zoneName: 'Paraná', province: 'Entre Ríos', family: 'Penosil', rubros: ['ferretería'] });
    assert.equal(good.statusCode, 200);
    assert.equal(good.body.count, 2);
    assert.equal(good.body.radiusKm, 12);
    assert.equal(good.body.results[0].province, 'Entre Ríos');
  } finally {
    globalThis.fetch = original.fetch;
    process.env.SUPABASE_URL = original.url ?? '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.key ?? '';
  }
});
