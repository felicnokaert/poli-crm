import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import metaSubscribe from '../api/meta-subscribe.js';
import metaOnboarding from '../api/meta-onboarding.js';
import inboxDelete from '../api/inbox-delete.js';

const ENV = { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const withFetch = async (impl, fn) => { const old = globalThis.fetch; globalThis.fetch = impl; Object.assign(process.env, ENV); try { await fn(); } finally { globalThis.fetch = old; } };
const user = (extra = {}) => ({ ok: true, status: 200, json: async () => ({ id: 'u1', email: 'brenda@grupopoliplast.com.ar', email_confirmed_at: '2026-01-01T00:00:00Z', ...extra }) });

test('un mail de la empresa SIN confirmar no entra', async () => {
  const http = async () => user({ email_confirmed_at: undefined });
  assert.equal(await authenticatedCorporateUser({ headers: { authorization: 'Bearer t' } }, ENV, http), null);
  assert.ok(await authenticatedCorporateUser({ headers: { authorization: 'Bearer t' } }, ENV, async () => user()));
});

test('reparar webhook y alta de cuentas de Meta: solo administradores', async () => {
  await withFetch(async () => user(), async () => {
    process.env.META_SYSTEM_USER_TOKEN = 't'; process.env.META_APP_SECRET = 's';
    const a = res(); await metaSubscribe({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'repair-webhook' } }, a);
    assert.equal(a.code, 403);
    const b = res(); await metaOnboarding({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { code: 'x' } }, b);
    assert.equal(b.code, 403);
  });
});

test('borrar mensajes: solo los que esa persona puede ver', async () => {
  const deleted = [];
  await withFetch(async (url, options = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return user();
    if (options.method === 'DELETE') { deleted.push(u); return { ok: true, status: 204, json: async () => ({}) }; }
    if (u.includes('whatsapp_events?select=event_id')) return { ok: true, status: 200, json: async () => [{ event_id: 'a' }] }; // 'b' es de un canal que no ve
    return { ok: true, status: 200, json: async () => ({}) };
  }, async () => {
    const r = res(); await inboxDelete({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { eventIds: ['a', 'b'] } }, r);
    assert.equal(r.body.deleted, 1);
    assert.equal(deleted.length, 1);
    assert.ok(deleted[0].includes('%22a%22') || deleted[0].includes('"a"'));
    assert.ok(!deleted[0].includes('b'.repeat(1) + '"') || !deleted[0].includes('"b"'));
  });
});

import { arToday, arAddDays } from '../src/ar-date.mjs';
import { shouldReply } from '../lib/whatsapp-autoreply.mjs';
import { persistEvents } from '../lib/storage.mjs';

test('hoy es el día argentino: a las 22:00 argentinas todavía es el mismo día', () => {
  assert.equal(arToday(Date.parse('2026-11-04T01:00:00Z')), '2026-11-03'); // 22:00 del 3/11 en Argentina
  assert.equal(arToday(Date.parse('2026-11-04T03:00:00Z')), '2026-11-04');
  assert.equal(arAddDays(1, Date.parse('2026-11-04T01:00:00Z')), '2026-11-04');
});

test('la respuesta automática no contesta mensajes viejos y cuenta el tope por día argentino', () => {
  const config = { enabled: true, mode: 'todos', contacts: [], log: [] };
  const base = { direction: 'inbound', message_type: 'text', text_body: 'hola', customer_wa_id: '5491100000000', event_id: 'e1' };
  const now = Date.parse('2026-11-04T15:00:00Z');
  assert.equal(shouldReply(config, { ...base, occurred_at: '2026-11-04T14:50:00Z' }, now, []).ok, true);
  assert.equal(shouldReply(config, { ...base, occurred_at: '2026-11-02T10:00:00Z' }, now, []).reason, 'mensaje-viejo');
});

test('persistEvents devuelve solo lo realmente nuevo', async () => {
  await withFetch(async () => ({ ok: true, status: 201, json: async () => [{ event_id: 'b' }] }), async () => {
    const result = await persistEvents([{ event_id: 'a' }, { event_id: 'b' }], ENV);
    assert.deepEqual(result.inserted, ['b']);
  });
});
