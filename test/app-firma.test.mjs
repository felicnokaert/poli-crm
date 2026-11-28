import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, createPublicKey } from 'node:crypto';
import { appFirmaAdmin, buildPayload, isLogisticsAdmin, publicKeyB64url, signToken } from '../lib/app-firma.mjs';

const { privateKey } = generateKeyPairSync('ed25519');
const env = { APP_FIRMA_PRIVADA: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };

test('Firma de Conteo: el token se verifica con la clave pública cruda de 32 bytes', () => {
  const token = signToken(buildPayload({ persona: 'Marcos', deposito: 'Villa Domínico', admin: false }, 0), privateKey);
  const [body, sig] = token.split('.');
  const raw = Buffer.from(publicKeyB64url(privateKey), 'base64url');
  assert.equal(raw.length, 32);
  const pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
  assert.ok(verify(null, Buffer.from(body, 'ascii'), pub, Buffer.from(sig, 'base64url')));
  const payload = JSON.parse(Buffer.from(body, 'base64url'));
  assert.deepEqual(payload, { v: 1, persona: 'Marcos', deposito: 'Villa Domínico', admin: false, exp: 300, aud: 'conteo' });
});

test('Firma de Conteo: admin solo para administradores de Logística o con permiso dado', () => {
  assert.ok(isLogisticsAdmin('diegoraul@grupopoliplast.com.ar'));
  assert.ok(!isLogisticsAdmin('brenda@grupopoliplast.com.ar'));
  assert.ok(isLogisticsAdmin('brenda@grupopoliplast.com.ar', [{ module: 'conteo.administracion', allowed: true }]));
  assert.ok(!isLogisticsAdmin('brenda@grupopoliplast.com.ar', [{ module: 'conteo.administracion', allowed: false }]));
});

test('Firma de Conteo: pide sesión y depósito válido', async () => {
  const deny = await appFirmaAdmin({ body: {} }, env, fetch, { authenticate: async () => null });
  assert.equal(deny.status, 401);
  const user = { id: 'u', email: 'brenda@grupopoliplast.com.ar', user_metadata: { full_name: 'Brenda' } };
  const bad = await appFirmaAdmin({ body: { deposito: 'Otro' } }, env, fetch, { authenticate: async () => user });
  assert.equal(bad.status, 400);
  const ok = await appFirmaAdmin({ body: { deposito: 'Mar del Plata' } }, { ...env }, async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }), { authenticate: async () => user });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.admin, false);
});

test('Firma de Conteo: sin variable propia deriva una clave estable de la clave de servicio', async () => {
  const { privateKeyFrom } = await import('../lib/app-firma.mjs');
  const a = publicKeyB64url(privateKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: 'x' }));
  assert.equal(a, publicKeyB64url(privateKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: 'x' })));
  assert.notEqual(a, publicKeyB64url(privateKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: 'y' })));
  assert.equal(privateKeyFrom({}), null);
});
