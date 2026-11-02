import test from 'node:test';
import assert from 'node:assert/strict';
import { autoReplyEvents, sameContact, shouldReply, typingDelayMs } from '../lib/whatsapp-autoreply.mjs';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', META_SYSTEM_USER_TOKEN: 't', ANTHROPIC_API_KEY: 'k' };
const event = (extra = {}) => ({ event_id: 'wamid.1', direction: 'inbound', message_type: 'text', text_body: 'hola, cuanto rinde la resina?', customer_wa_id: '5491150001111', phone_number_id: '111', ...extra });

test('sameContact compara por los últimos 10 dígitos', () => {
  assert.equal(sameContact('5491150001111', '54 11 5000-1111'), true);
  assert.equal(sameContact('5491150001111', '5491150002222'), false);
  assert.equal(sameContact('', ''), false);
});

test('shouldReply: apagado, contacto no habilitado, ya contestado y tope por hora', () => {
  const on = { enabled: true, contacts: [{ wa: '5491150001111' }], log: [] };
  assert.equal(shouldReply({ ...on, enabled: false }, event()).reason, 'apagado');
  assert.equal(shouldReply(on, event({ customer_wa_id: '5491199999999' })).reason, 'contacto-no-habilitado');
  assert.equal(shouldReply(on, event({ message_type: 'image' })).reason, 'no-es-texto');
  assert.equal(shouldReply({ ...on, log: [{ event_id: 'wamid.1' }] }, event()).reason, 'ya-contestado');
  const many = Array.from({ length: 12 }, (_, i) => ({ event_id: `e${i}`, status: 'enviado', wa: '5491150001111', at: new Date().toISOString() }));
  assert.equal(shouldReply({ ...on, log: many }, event()).reason, 'tope-por-hora');
  assert.equal(shouldReply(on, event()).ok, true);
});

test('typingDelayMs queda entre 3 y 9 segundos', () => {
  assert.equal(typingDelayMs('hola'), 3000);
  assert.equal(typingDelayMs('x'.repeat(500)), 9000);
});

function fakeHttp(config) {
  const calls = [];
  let saved = null;
  const http = async (url, options = {}) => {
    const u = String(url);
    calls.push({ u, method: options.method || 'GET', body: options.body });
    if (u.includes('crm_system_status?select=detail')) return { ok: true, json: async () => [{ detail: config }] };
    if (u.includes('crm_system_status') && options.method === 'POST') { saved = JSON.parse(options.body)[0].detail; return { ok: true, json: async () => ({}) }; }
    if (u.includes('whatsapp_events?select')) return { ok: true, json: async () => [] };
    if (u.includes('graph.facebook.com')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.out' }] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { http, calls, saved: () => saved };
}

test('contesta al contacto habilitado, envía por Graph y deja el registro', async () => {
  const f = fakeHttp({ enabled: true, contacts: [{ wa: '5491150001111' }], log: [] });
  const supabase = { rpc: async () => ({ data: [] }), from: () => ({ select: async () => ({ data: [] }) }) };
  const out = await autoReplyEvents([event()], env, { http: f.http, sleep: async () => {}, supabase, generate: async () => ({ draft: 'Hola, ¿qué producto y qué superficie?', derive: '', attach: [] }) });
  assert.equal(out[0].status, 'enviado');
  const sent = f.calls.filter((c) => c.u.includes('graph.facebook.com') && JSON.parse(c.body).type === 'text');
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0].body).to, '5491150001111');
  assert.equal(f.saved().log.length, 1);
});

test('no contesta si el contacto no está habilitado', async () => {
  const f = fakeHttp({ enabled: true, contacts: [{ wa: '5491199999999' }], log: [] });
  const out = await autoReplyEvents([event()], env, { http: f.http, sleep: async () => {}, generate: async () => ({ draft: 'x' }) });
  assert.deepEqual(out, []);
  assert.equal(f.calls.filter((c) => c.u.includes('graph.facebook.com')).length, 0);
});

test('un error al enviar queda registrado y no rompe', async () => {
  const f = fakeHttp({ enabled: true, contacts: [{ wa: '5491150001111' }], log: [] });
  const http = async (url, options) => (String(url).includes('graph.facebook.com') ? { ok: false, status: 400, json: async () => ({ error: { message: 'Permiso faltante' } }) } : f.http(url, options));
  const supabase = { rpc: async () => ({ data: [] }), from: () => ({ select: async () => ({ data: [] }) }) };
  const out = await autoReplyEvents([event()], env, { http, sleep: async () => {}, supabase, generate: async () => ({ draft: 'Hola' }) });
  assert.equal(out[0].status, 'error');
  assert.match(out[0].error, /Permiso faltante/);
});

test('modo todos: contesta a cualquiera salvo los marcados no comercial', () => {
  const cfg = { enabled: true, mode: 'todos', contacts: [], log: [] };
  const familiar = [{ key: 'x', customerWaId: '5491188887777', customerName: 'Mamá' }];
  assert.equal(shouldReply(cfg, event({ customer_wa_id: '5491188887777', customer_name: 'Mamá' }), Date.now(), familiar).reason, 'no-comercial');
  assert.equal(shouldReply(cfg, event({ customer_wa_id: '5491122223333', customer_name: 'Cliente' }), Date.now(), familiar).ok, true);
});

test('modo todos: tope de 150 respuestas por día', () => {
  const log = Array.from({ length: 150 }, (_, i) => ({ event_id: `d${i}`, status: 'enviado', wa: String(i).padStart(10, '5'), at: new Date().toISOString() }));
  assert.equal(shouldReply({ enabled: true, mode: 'todos', contacts: [], log }, event({ customer_wa_id: '5491122223333' }), Date.now(), []).reason, 'tope-por-dia');
});
