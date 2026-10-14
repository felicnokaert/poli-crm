import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleConfig, normalizeGoogle, searchGoogle, takeQuota } from '../lib/prospect-google.mjs';
import handler from '../api/prospeccion.js';

const FULL = { PROSPECT_GOOGLE_ENABLED: 'true', GOOGLE_PLACES_API_KEY: 'k', PROSPECT_GOOGLE_DAILY_CAP: '20', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' };

test('apagado por defecto: falta cualquier pieza y no se activa', () => {
  assert.equal(googleConfig({}).enabled, false);
  for (const key of Object.keys(FULL)) {
    const env = { ...FULL };
    delete env[key];
    assert.equal(googleConfig(env).enabled, false, `sin ${key}`);
  }
  assert.equal(googleConfig({ ...FULL, PROSPECT_GOOGLE_ENABLED: 'yes' }).enabled, false);
  assert.equal(googleConfig({ ...FULL, PROSPECT_GOOGLE_DAILY_CAP: '0' }).enabled, false);
  assert.equal(googleConfig(FULL).enabled, true);
  assert.equal(googleConfig({ ...FULL, PROSPECT_GOOGLE_DAILY_CAP: '99999' }).cap, 200);
});

test('el cupo falla cerrado: apagado, error de la base o tope alcanzado no dejan consultar', async () => {
  const never = async () => { throw new Error('no debería llamarse'); };
  assert.deepEqual(await takeQuota({}, never), { ok: false, reason: 'off' });
  assert.equal((await takeQuota(FULL, async () => { throw new Error('red'); })).reason, 'error');
  assert.equal((await takeQuota(FULL, async () => new Response('{}', { status: 500 }))).reason, 'error');
  assert.equal((await takeQuota(FULL, async () => new Response('false', { status: 200 }))).reason, 'cap');
  const calls = [];
  const ok = await takeQuota(FULL, async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Response('true', { status: 200 }); }, new Date('2026-10-14T12:00:00Z'));
  assert.equal(ok.ok, true);
  assert.deepEqual(calls[0].body, { p_day: '2026-10-14', p_cap: 20 });
  assert.match(calls[0].url, /rpc\/prospect_quota_take$/);
});

test('normaliza lugares de Google al formato de prospecto', () => {
  const [item] = normalizeGoogle({ places: [{ id: 'g1', displayName: { text: 'Ferretería Sur' }, formattedAddress: 'Calle 1', internationalPhoneNumber: '+54 343 400-0000', websiteUri: 'https://fs.com.ar', location: { latitude: -31.7, longitude: -60.5 } }, { id: 'g2' }] }, { zoneName: 'Paraná', family: 'Penosil' });
  assert.equal(item.source, 'Google Maps');
  assert.equal(item.googleId, 'g1');
  assert.equal(item.phone, '+54 343 400-0000');
  assert.equal(normalizeGoogle({ places: [{ id: 'g2' }] }).length, 0);
});

test('searchGoogle manda la clave por encabezado y pide solo los campos necesarios', async () => {
  let seen;
  const out = await searchGoogle({ query: 'ferretería', lat: -31.7, lon: -60.5, radiusKm: 8 }, FULL, async (url, options) => { seen = { url, options }; return new Response('{"places":[]}', { status: 200 }); });
  assert.equal(out.ok, true);
  assert.equal(seen.options.headers['X-Goog-Api-Key'], 'k');
  assert.ok(seen.options.headers['X-Goog-FieldMask'].includes('places.displayName'));
  assert.ok(!seen.url.includes('key='));
  assert.equal((await searchGoogle({ query: 'x', lat: 0, lon: 0, radiusKm: 1 }, FULL, async () => new Response('{}', { status: 403 }))).ok, false);
});

test('el endpoint rechaza Google Maps cuando está apagado, sin tocar la red', async () => {
  const saved = { ...process.env };
  for (const key of Object.keys(FULL)) delete process.env[key];
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; return new Response('{}', { status: 200 }); };
  try {
    const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    // Sin sesión válida el endpoint corta en 401 antes de cualquier consulta externa.
    await handler({ method: 'POST', headers: {}, body: { source: 'Google Maps', lat: -31.7, lon: -60.5, rubros: ['ferretería'] } }, response);
    assert.ok([401, 403].includes(response.statusCode));
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(process.env, saved);
  }
});
