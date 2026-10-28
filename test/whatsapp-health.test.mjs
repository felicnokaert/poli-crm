import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWhatsAppHealth, runWhatsAppHealthCheck } from '../lib/whatsapp-health.mjs';

const NOW = new Date('2026-10-15T12:00:00Z');
const good = {
  report: { token: { isValid: true }, accounts: [{ channel: 'general', subscribedApps: ['Agente Poliplast'], wabaWebhookOverride: [], phoneNumbers: [{ number: '+54 9 11 5262-7555', status: 'CONNECTED', webhookOverride: null }] }] },
  webhook: { subscribed: true, active: true, urlOk: true, messagesField: true },
  lastInboundAt: '2026-10-15T09:00:00Z', now: NOW,
};

test('todo en orden no da problemas', () => {
  const r = evaluateWhatsAppHealth(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('cuenta sin ninguna app suscripta se marca', () => {
  const r = evaluateWhatsAppHealth({ ...good, report: { ...good.report, accounts: [{ ...good.report.accounts[0], subscribedApps: [] }] } });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /ninguna app suscripta/);
});

test('número desconectado, webhook propio en el número y URL cambiada se marcan', () => {
  const account = { ...good.report.accounts[0], phoneNumbers: [{ number: '+54 9 11 5262-7555', status: 'DISCONNECTED', webhookOverride: 'https://otro.com/hook' }] };
  const r = evaluateWhatsAppHealth({ ...good, report: { ...good.report, accounts: [account] }, webhook: { ...good.webhook, urlOk: false, messagesField: false } });
  const text = r.problems.join(' | ');
  assert.match(text, /DISCONNECTED/);
  assert.match(text, /webhook propio/);
  assert.match(text, /otra dirección/);
  assert.match(text, /"messages"/);
});

test('token inválido o ausente se avisa', () => {
  assert.match(evaluateWhatsAppHealth({ ...good, report: { token: { error: 'x' }, accounts: [] } }).problems[0], /acceso técnico/);
  assert.match(evaluateWhatsAppHealth({ ...good, report: { token: { isValid: false }, accounts: [] } }).problems[0], /ya no es válido/);
});

test('días sin mensajes entrantes NO dan aviso: el aviso es por línea, no por mensajes', () => {
  const r = evaluateWhatsAppHealth({ ...good, lastInboundAt: '2026-10-11T20:43:00Z' });
  assert.equal(r.ok, true);
  assert.equal(r.lastInboundAt, '2026-10-11T20:43:00Z');
});

test('sin token de Meta el chequeo se omite sin fallar', async () => {
  assert.deepEqual(await runWhatsAppHealthCheck({}), { skipped: true });
});

test('el chequeo completo consulta a Meta, evalúa y guarda el resultado', async () => {
  const saved = [];
  const http = async (url, opts = {}) => {
    const u = String(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.includes('debug_token')) return json({ data: { app_id: '857', is_valid: true, application: 'Agente', scopes: [], granular_scopes: [] } });
    if (u.includes('/subscriptions')) return json({ data: [{ object: 'whatsapp_business_account', callback_url: 'https://poli-crm.vercel.app/api/whatsapp-webhook', active: true, fields: [{ name: 'messages' }] }] });
    if (u.includes('subscribed_apps')) return json({ data: [] });
    if (u.includes('phone_numbers')) return json({ data: [{ id: '1', display_phone_number: '+54 9 11', status: 'CONNECTED' }] });
    if (u.includes('whatsapp_events')) return json([{ occurred_at: '2026-10-15T10:00:00Z' }]);
    if (u.includes('crm_system_status')) { saved.push(JSON.parse(opts.body)); return { ok: true, status: 201 }; }
    return json({ id: 'x', name: 'WABA' });
  };
  const r = await runWhatsAppHealthCheck({ META_SYSTEM_USER_TOKEN: 't', META_APP_SECRET: 's', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, { http, now: NOW });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /ninguna app suscripta/.test(p)));
  assert.equal(saved[0].key, 'whatsapp-health');
  assert.equal(saved[0].ok, false);
  assert.equal(r.saved, true);
});
