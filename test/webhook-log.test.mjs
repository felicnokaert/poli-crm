import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePayload, logWebhookCall, recentWebhookCalls } from '../lib/webhook-log.mjs';

const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '111' }, messages: [{ type: 'text', text: { body: 'secreto' }, from: '5491100000000' }], statuses: [{ status: 'read' }] } }] }] };

test('el resumen no incluye texto ni teléfonos de clientes', () => {
  const s = summarizePayload(payload);
  assert.deepEqual(s.types, { 'msg:text': 1, 'status:read': 1 });
  assert.deepEqual(s.phoneNumberIds, ['111']);
  assert.ok(!JSON.stringify(s).includes('secreto'));
  assert.ok(!JSON.stringify(s).includes('5491100000000'));
});

test('logWebhookCall falla en silencio sin configuración o si la base responde error', async () => {
  assert.equal(await logWebhookCall({ method: 'POST', outcome: 'x' }, {}), false);
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  assert.equal(await logWebhookCall({ method: 'POST', outcome: 'x' }, env, async () => { throw new Error('caído'); }), false);
  assert.equal(await logWebhookCall({ method: 'POST', outcome: 'x' }, env, async () => ({ ok: true })), true);
});

test('recentWebhookCalls resume por resultado y dice cuándo fue la última llamada', async () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const rows = [{ received_at: '2026-10-15T10:00:00Z', method: 'POST', outcome: 'stored' }, { received_at: '2026-10-15T09:00:00Z', method: 'GET', outcome: 'verify_ok' }];
  const r = await recentWebhookCalls(env, async () => ({ ok: true, json: async () => rows }));
  assert.equal(r.posts24h, 1);
  assert.equal(r.lastPostAt, '2026-10-15T10:00:00Z');
  assert.deepEqual(r.byOutcome, { stored: 1, verify_ok: 1 });
  const bad = await recentWebhookCalls(env, async () => ({ ok: false, status: 404 }));
  assert.equal(bad.available, false);
});
