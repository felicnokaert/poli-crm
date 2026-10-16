import test from 'node:test';
import assert from 'node:assert/strict';
import { errorRecord, listClientErrors, logClientError } from '../lib/error-log.mjs';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const req = (body) => ({ headers: { authorization: 'Bearer t' }, body });
function http(email, stored = []) {
  return async (url, options = {}) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u', email }) };
    if (url.includes('/object/list/')) return { ok: true, json: async () => (JSON.parse(options.body).prefix.includes('2026-10-16') ? stored.map((s) => ({ name: s.name })) : []) };
    if (options.method === 'POST' && url.includes('/object/backups/errors/')) { stored.push({ name: url.split('/').at(-1), body: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) }; }
    const hit = stored.find((s) => url.endsWith(s.name));
    return hit ? { ok: true, json: async () => hit.body } : { ok: false, json: async () => ({}) };
  };
}

test('el error de pantalla queda guardado con quién, cuándo y dónde (recortado)', async () => {
  const stored = [];
  const now = new Date('2026-10-16T18:00:00Z');
  const result = await logClientError(req({ message: 'x'.repeat(900), view: 'settings', stack: 'at y' }), env, http('juan@grupopoliplast.com.ar', stored), now);
  assert.equal(result.status, 200);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].body.email, 'juan@grupopoliplast.com.ar');
  assert.equal(stored[0].body.view, 'settings');
  assert.equal(stored[0].body.message.length, 500);
  assert.equal(errorRecord({}, {}).message, '');
  const list = await listClientErrors(req({}), env, http('felipe@grupopoliplast.com.ar', stored), now);
  assert.equal(list.body.errors.length, 1);
  const denied = await listClientErrors(req({}), env, http('juan@grupopoliplast.com.ar', stored), now);
  assert.equal(denied.status, 403, 'solo Felipe ve los errores');
});
