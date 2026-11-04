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

import { teamAnswer } from '../src/assistant-answer.mjs';
import { quoteConversion } from '../src/quote-conversion.mjs';
import { buildCustomerBase } from '../src/customer-base.mjs';
import { tacosFor } from '../src/ml-tacos.mjs';

test('respuestas del equipo contradictorias: se muestran las dos, no una como «la del equipo»', () => {
  const rows = [
    { kind: 'pregunta', body: 'Pregunta: rinde\nRespuesta: Rinde 1 kg por m2.' },
    { kind: 'pregunta', body: 'Pregunta: rinde\nRespuesta: Hola! Rinde 1 kg por m2.' },
    { kind: 'pregunta', body: 'Pregunta: rinde\nRespuesta: Rinde 5 kg por m2.' },
    { kind: 'pregunta', body: 'Pregunta: rinde\nRespuesta: Saludos, rinde 5 kg por m2.' },
    { kind: 'pregunta', body: 'Pregunta: rinde\nRespuesta: Rinde 5 kg por m2 aprox.' },
  ];
  const result = teamAnswer(rows, { key: 'rendimiento', line: ['rinde', 'm2'], evidence: /\d/ });
  assert.equal(result.varied, true);
  assert.equal(result.examples.length, 2);
});

test('una factura cierra una sola cotización', () => {
  const row = (tipo, fecha, extra = {}) => ({ tipo, fecha, company: 'POLIPLAST', cliente_id: 'c1', cliente: 'Cliente', total: 100, ...extra });
  const result = quoteConversion([row('COT', '2026-09-01'), row('COT', '2026-09-02'), row('COT', '2026-09-03'), row('FCA', '2026-09-10')], { today: '2026-11-03' });
  assert.equal(result.quotes, 3);
  assert.equal(result.closed, 1);
});

test('las notas de crédito se restan del total de 24 meses', () => {
  const clients = [{ id: 'c1', company: 'Cliente SA' }];
  const rows = [
    { tipo: 'FCA', fecha: '2026-10-01', cliente: 'Cliente SA', total: 1000, company: 'POLIPLAST' },
    { tipo: 'NCA', fecha: '2026-10-05', cliente: 'Cliente SA', total: 400, company: 'POLIPLAST' },
  ];
  const base = buildCustomerBase(rows, clients, { today: '2026-11-03' });
  const entry = base.get ? base.get('c1') : (base.byClient || base).get?.('c1');
  assert.ok(entry, 'debe haber ficha de facturación');
  assert.equal(entry.total24, 600);
});

test('TACoS: gasto vacío no es 0 % en vivo', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  assert.notEqual(tacosFor({ sales30: 1000, live: { spend: null, fetchedAt: '2026-11-03T08:00:00Z' }, now }).state, 'en-vivo');
  assert.equal(tacosFor({ sales30: 1000, live: { spend: 100, fetchedAt: '2026-11-03T08:00:00Z' }, now }).state, 'en-vivo');
});

import { automationPauseAdmin, readPause } from '../lib/automation-pause.mjs';
import { autoReplyEvents } from '../lib/whatsapp-autoreply.mjs';
import { gmailAutoSendCron } from '../lib/gmail-service.mjs';

test('pausa global: solo administradores la cambian y frena respuesta automática y Gmail', async () => {
  let paused = false;
  const http = async (url, options = {}) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, headers: { get: () => '0-0/0' } });
    if (u.includes('automations-pause') && options.method !== 'POST') return ok(paused ? [{ detail: { paused: true, by: 'felipe@x', at: 'ya' } }] : []);
    if (u.includes('crm_system_status') && options.method === 'POST') { paused = JSON.parse(options.body)[0].detail.paused; return ok([]); }
    return ok([]);
  };
  const authAdmin = async () => ({ id: 'u', email: 'felipe@grupopoliplast.com.ar' });
  const authUser = async () => ({ id: 'u2', email: 'brenda@grupopoliplast.com.ar' });
  const isAdmin = (email) => email.startsWith('felipe');
  assert.equal((await automationPauseAdmin({ body: { op: 'set', paused: true } }, ENV, http, { authenticate: authUser, isAdmin })).status, 403);
  assert.equal((await automationPauseAdmin({ body: { op: 'set', paused: true } }, ENV, http, { authenticate: authAdmin, isAdmin })).status, 200);
  assert.equal((await readPause(ENV, http)).paused, true);
  // con la pausa, la respuesta automática no contesta y el cron de Gmail no manda
  assert.deepEqual(await autoReplyEvents([{ event_id: 'x', direction: 'inbound', message_type: 'text', text_body: 'hola', customer_wa_id: '5491100000000' }], ENV, { http }), []);
  const cron = await gmailAutoSendCron({}, { ...ENV, GOOGLE_CLIENT_ID: 'i', GOOGLE_CLIENT_SECRET: 's' }, http, new Date('2026-11-03T15:00:00Z'), async () => {});
  assert.match(String(cron.body.skipped), /pausa/);
});
