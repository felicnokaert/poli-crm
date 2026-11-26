import test from 'node:test';
import assert from 'node:assert/strict';
import { appReportsAdmin, cleanReport } from '../lib/app-reports.mjs';

test('Algo no anda: limpia el aviso y exige texto', () => {
  assert.ok(cleanReport({ text: ' ' }, {}).error);
  const { report } = cleanReport({ text: 'No copia', severity: 'raro', view: 'quoter', width: 390 }, { email: 'Brenda@grupopoliplast.com.ar' });
  assert.equal(report.severity, 'molesta');
  assert.equal(report.by, 'brenda@grupopoliplast.com.ar');
  assert.equal(report.status, 'nuevo');
});

test('Algo no anda: cualquiera manda, solo administradores listan', async () => {
  const saved = [];
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const http = async (url, init = {}) => {
    if ((init.method || 'GET') !== 'GET') saved.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => (saved.length ? [{ detail: saved.at(-1)[0].detail }] : []), text: async () => '' };
  };
  const deps = { authenticate: async () => ({ id: 'u', email: 'brenda@grupopoliplast.com.ar' }), isAdmin: (email) => email.startsWith('felipe') };
  const sent = await appReportsAdmin({ body: { op: 'send', text: 'No carga Entregas' } }, env, http, deps);
  assert.equal(sent.status, 200);
  assert.equal(saved.at(-1)[0].detail.items[0].text, 'No carga Entregas');
  const listed = await appReportsAdmin({ body: { op: 'list' } }, env, http, deps);
  assert.equal(listed.status, 403);
});
