import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteUser, isAdminEmail } from '../lib/admin-users.mjs';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const ID = '11111111-1111-1111-1111-111111111111';
const FELIPE = { id: '22222222-2222-2222-2222-222222222222', email: 'felipe@grupopoliplast.com.ar' };

function fakeHttp({ caller = FELIPE, target = { id: ID, email: 'brenda@grupopoliplast.com.ar' }, deleteOk = true } = {}) {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push([options.method || 'GET', url]);
    if (url.endsWith('/auth/v1/user')) return { ok: Boolean(caller), json: async () => caller };
    if (url.includes('/auth/v1/admin/users/') && (options.method || 'GET') === 'GET') return { ok: Boolean(target), json: async () => target };
    if (url.includes('/auth/v1/admin/users/') && options.method === 'DELETE') return { ok: deleteOk, json: async () => ({}) };
    return { ok: true, json: async () => ({}) };
  };
  return { http, calls };
}
const req = (body, token = 'Bearer t') => ({ headers: { authorization: token }, body });

test('solo Felipe borra: otro usuario corporativo recibe 403', async () => {
  const { http } = fakeHttp({ caller: { id: 'x', email: 'brenda@grupopoliplast.com.ar' } });
  assert.equal((await deleteUser(req({ userId: ID }), env, http)).status, 403);
});

test('sin sesión válida es 401', async () => {
  const { http } = fakeHttp({ caller: null });
  assert.equal((await deleteUser(req({ userId: ID }), env, http)).status, 401);
});

test('no se puede borrar a uno mismo ni a un administrador', async () => {
  let { http } = fakeHttp();
  assert.equal((await deleteUser(req({ userId: FELIPE.id }), env, http)).status, 400);
  ({ http } = fakeHttp({ target: { id: ID, email: 'felipecnokaert@gmail.com' } }));
  const result = await deleteUser(req({ userId: ID }), env, http);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /administrador/);
});

test('borra al usuario y su descripción, y avisa a quién', async () => {
  const { http, calls } = fakeHttp();
  const result = await deleteUser(req({ userId: ID }), env, http);
  assert.deepEqual(result, { status: 200, body: { ok: true, email: 'brenda@grupopoliplast.com.ar' } });
  assert.ok(calls.some(([m, u]) => m === 'DELETE' && u.endsWith(`/auth/v1/admin/users/${ID}`)));
  assert.ok(calls.some(([m, u]) => m === 'DELETE' && u.includes('team_self_profiles?email=eq.brenda')));
});

test('id inválido es 400 y isAdminEmail ignora mayúsculas', async () => {
  const { http } = fakeHttp();
  assert.equal((await deleteUser(req({ userId: 'no' }), env, http)).status, 400);
  assert.equal(isAdminEmail('Felipe@GrupoPoliplast.com.ar'), true);
});
