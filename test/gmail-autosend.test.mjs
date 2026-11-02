import test from 'node:test';
import assert from 'node:assert/strict';
import { gmailAutoSendCron } from '../lib/gmail-service.mjs';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
const item = (id, step, extra = {}) => ({ id, prospectId: 'p1', step, state: 'aprobado', to: 'cliente@empresa.com', company: 'Empresa', subject: 'Hola', body: 'Texto\n\nFeli\nGrupo Poliplast\nSi preferís no recibir más mensajes nuestros, respondé "BAJA" y no te escribimos más.', dueOn: '2026-11-03', ...extra });

function fake({ outbox, auto = { enabled: true, perDay: 25, userId: 'u1' }, sends = [] }) {
  const calls = [];
  const upserts = [];
  const http = async (url, options = {}) => {
    const u = String(url);
    calls.push(u);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, headers: { get: () => '0-0/0' } });
    if (u.includes('crm_system_status?select=detail')) return ok([{ detail: { users: { 'felipe@grupopoliplast.com.ar': auto } } }]);
    if (u.includes('gmail_accounts')) return ok([{ email: 'felipe@grupopoliplast.com.ar', refresh_token: 'rt', paused: false }]);
    if (u.includes('workspace_states')) return ok([{ data: { outbox, doNotContact: [] } }]);
    if (options.method === 'HEAD') return ok([]);
    if (u.includes('gmail_sends') && options.method === 'POST') { upserts.push(JSON.parse(options.body)[0]); return ok([]); }
    if (u.includes('gmail_sends')) return ok(sends);
    if (u.includes('oauth2.googleapis.com')) return ok({ access_token: 'at' });
    if (u.includes('settings/sendAs')) return ok({ signature: '<b>Felipe</b>' });
    if (u.includes('messages/send')) return ok({ id: `m${upserts.length}`, threadId: 't1' });
    return ok([]);
  };
  return { http, calls, upserts };
}

test('el envío automático manda los aprobados que tocan, con pausa y sin tocar la bandeja', async () => {
  const f = fake({ outbox: [item('a', 1), item('b', 1, { to: 'otro@empresa.com', prospectId: 'p2' })] });
  const now = new Date('2026-11-03T15:00:00Z'); // martes 12:00 argentinas
  const result = await gmailAutoSendCron({}, env, f.http, now, async () => {});
  assert.equal(result.body.report[0].sent, 2);
  assert.equal(f.upserts.length, 2);
});

test('no manda recordatorios si el primer mail no salió, ni fuera de horario, ni si está apagado', async () => {
  const now = new Date('2026-11-03T15:00:00Z');
  const sinPrimero = fake({ outbox: [item('c', 2)] });
  assert.equal((await gmailAutoSendCron({}, env, sinPrimero.http, now, async () => {})).body.report[0].sent, 0);
  const noche = fake({ outbox: [item('d', 1)] });
  const late = await gmailAutoSendCron({}, env, noche.http, new Date('2026-11-04T02:00:00Z'), async () => {}); // 23 hs
  assert.equal(late.body.report[0].sent, 0);
  assert.match(late.body.report[0].stopped, /horario/);
  const apagado = fake({ outbox: [item('e', 1)], auto: { enabled: false, userId: 'u1' } });
  assert.deepEqual((await gmailAutoSendCron({}, env, apagado.http, now, async () => {})).body.report, []);
});
