import test from 'node:test';
import assert from 'node:assert/strict';
import { technicalAdmin, DOCUMENT_MIME_TYPES } from '../lib/technical-admin.mjs';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const id1 = '11111111-1111-1111-1111-111111111111';
const id2 = '22222222-2222-2222-2222-222222222222';
function fakeHttp(email, { deleteFails = false } = {}) {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u', email }) };
    if (url.includes('select=id,storage_path')) return { ok: true, json: async () => [{ id: id1, storage_path: `${id1}/a.pdf` }, { id: id2, storage_path: null }] };
    if (options.method === 'DELETE' && url.includes('/rest/v1/technical_documents')) {
      return deleteFails ? { ok: false, status: 409, json: async () => ({ message: 'violates foreign key constraint' }) } : { ok: true, json: async () => [{ id: id1 }, { id: id2 }] };
    }
    return { ok: true, json: async () => ({}) };
  };
  return { http, calls };
}
const request = (body) => ({ headers: { authorization: 'Bearer t' }, body: { action: 'technical', ...body } });

test('borra en tanda por el servidor, archivos incluidos', async () => {
  const { http, calls } = fakeHttp('felipe@grupopoliplast.com.ar');
  const result = await technicalAdmin(request({ mode: 'delete', ids: [id1, id2, 'no-es-id'] }), env, http);
  assert.equal(result.body.deleted, 2);
  assert.equal(result.body.requested, 2);
  assert.ok(calls.some((call) => call.url.includes('/storage/v1/object/technical-documents') && call.method === 'DELETE'));
});

test('si la base no deja borrar, devuelve el motivo real', async () => {
  const { http } = fakeHttp('felipe@grupopoliplast.com.ar', { deleteFails: true });
  const result = await technicalAdmin(request({ mode: 'delete', ids: [id1] }), env, http);
  assert.equal(result.body.deleted, 0);
  assert.deepEqual(result.body.errors, ['violates foreign key constraint']);
});

test('habilitar tipos: Word, Excel y fotos; solo Felipe', async () => {
  const { http, calls } = fakeHttp('felipe@grupopoliplast.com.ar');
  const ok = await technicalAdmin(request({ mode: 'allowTypes' }), env, http);
  assert.equal(ok.status, 200);
  const put = calls.find((call) => call.method === 'PUT');
  assert.deepEqual(JSON.parse(put.body).allowed_mime_types, DOCUMENT_MIME_TYPES);
  assert.ok(DOCUMENT_MIME_TYPES.includes('image/jpeg'));
  const other = await technicalAdmin(request({ mode: 'allowTypes' }), env, fakeHttp('brenda@grupopoliplast.com.ar').http);
  assert.equal(other.status, 403);
});
