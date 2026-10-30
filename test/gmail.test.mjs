import test from 'node:test';
import assert from 'node:assert/strict';
import { authUrl, buildRawMessage, canSendNow, classifyReply, followUpsDue, gmailEnabled, sendMessage, argentinaHour } from '../lib/gmail.mjs';
import { addBlock } from '../src/do-not-contact.mjs';

const ENV = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' };
const item = { id: 'p1:1', prospectId: 'p1', to: 'ventas@sur.com.ar', company: 'Sur', step: 1, state: 'aprobado', dueOn: '2026-11-02' };
const monday10 = new Date('2026-11-02T13:00:00Z'); // lunes 10:00 en Argentina

test('sin credenciales de Google no sale nada', () => {
  assert.equal(gmailEnabled({}), false);
  assert.match(canSendNow({ item, now: monday10, env: {} }).reason, /todavía no está conectado/);
});

test('canSendNow frena por pausa, No contactar, horario, fin de semana, límite, rebote y respuesta', () => {
  assert.equal(canSendNow({ item, now: monday10, env: ENV }).ok, true);
  assert.match(canSendNow({ item, now: monday10, env: ENV, paused: true }).reason, /pausa/);
  assert.match(canSendNow({ item: { ...item, state: 'borrador' }, now: monday10, env: ENV }).reason, /no está aprobado/);
  assert.match(canSendNow({ item, now: monday10, env: ENV, blocked: addBlock([], { email: item.to }).list }).reason, /No contactar/);
  assert.match(canSendNow({ item, now: new Date('2026-11-02T23:00:00Z'), env: ENV }).reason, /horario/);
  assert.match(canSendNow({ item, now: new Date('2026-11-01T14:00:00Z'), env: ENV }).reason, /Fin de semana/);
  assert.match(canSendNow({ item, now: monday10, env: ENV, sentToday: 25 }).reason, /límite de 25/);
  assert.match(canSendNow({ item, now: monday10, env: ENV, bounced: ['VENTAS@sur.com.ar'] }).reason, /rebotó/);
  assert.match(canSendNow({ item: { ...item, step: 2 }, now: monday10, env: ENV, repliedTo: [item.to] }).reason, /Ya respondió/);
  assert.equal(argentinaHour(monday10), 10);
});

test('recordatorios: solo si el primero salió, ya toca y no hubo respuesta ni etiqueta', () => {
  const outbox = [{ ...item, state: 'enviado' }, { ...item, id: 'p1:2', step: 2, dueOn: '2026-11-05' }, { ...item, id: 'p1:3', step: 3, dueOn: '2026-11-09' }];
  assert.deepEqual(followUpsDue(outbox, { today: '2026-11-05' }).map((x) => x.id), ['p1:2']);
  assert.deepEqual(followUpsDue(outbox, { today: '2026-11-10' }).map((x) => x.id), ['p1:2', 'p1:3']);
  assert.deepEqual(followUpsDue(outbox, { today: '2026-11-10', repliedTo: ['ventas@sur.com.ar'] }), []);
  assert.deepEqual(followUpsDue(outbox, { today: '2026-11-10', tagged: ['VENTAS@sur.com.ar'] }), []);
});

test('el mensaje sale en texto plano, con asunto codificado y cabecera de baja', () => {
  const raw = buildRawMessage({ from: 'felipe@grupopoliplast.com.ar', to: 'a@b.com', subject: 'Poliplast · consulta\nX', body: 'Hola\nChau' });
  const text = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.match(text, /Subject: =\?UTF-8\?B\?/);
  assert.equal(text.split('\r\n').filter((line) => line.startsWith('Subject:')).length, 1);
  assert.match(text, /List-Unsubscribe: <mailto:felipe@grupopoliplast\.com\.ar\?subject=BAJA>/);
  assert.match(text, /\r\n\r\nHola\r\nChau$/);
});

test('clasifica respuestas sin IA: baja, rebote, automática, otro contacto, interés y rechazo', () => {
  assert.equal(classifyReply('Por favor den de baja este mail').kind, 'baja');
  assert.equal(classifyReply('Mail Delivery Subsystem: no se pudo entregar').kind, 'rebote');
  assert.equal(classifyReply('Estoy fuera de la oficina hasta el lunes').kind, 'automatica');
  const other = classifyReply('Escriban a compras@sur.com.ar, ellos ven eso');
  assert.equal(other.kind, 'otro-contacto'); assert.deepEqual(other.emails, ['compras@sur.com.ar']);
  assert.equal(classifyReply('Nos interesa, pasame la lista de precios').kind, 'interesado');
  assert.equal(classifyReply('No nos interesa, ya tenemos proveedor').kind, 'no-interesa');
  assert.equal(classifyReply('ok gracias').kind, 'revisar');
});

test('authUrl pide solo enviar y leer, limitado al dominio, y sendMessage usa el token', async () => {
  const url = new URL(authUrl({ clientId: 'id', redirectUri: 'https://x/cb', state: 's', loginHint: 'felipe@grupopoliplast.com.ar' }));
  assert.equal(url.searchParams.get('hd'), 'grupopoliplast.com.ar');
  assert.match(url.searchParams.get('scope'), /gmail\.send/);
  assert.doesNotMatch(url.searchParams.get('scope'), /gmail\.modify|mail\.google\.com\/$/);
  let seen;
  const fake = async (u, opts) => { seen = { u, opts }; return { ok: true, json: async () => ({ id: 'm1', threadId: 't1' }) }; };
  assert.deepEqual(await sendMessage({ accessToken: 'tok', raw: 'abc' }, fake), { id: 'm1', threadId: 't1' });
  assert.equal(seen.opts.headers.Authorization, 'Bearer tok');
  await assert.rejects(sendMessage({ accessToken: 't', raw: 'x' }, async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'denegado' } }) })), /denegado/);
});

import { emailFromIdToken, repliesInThread, signState, verifyState } from '../lib/gmail.mjs';
import { gmailAdmin } from '../lib/gmail-service.mjs';
import { applyReplies } from '../src/mail-sequence.mjs';

test('el state firma a quien pidió el permiso y vence', () => {
  const state = signState('Felipe@grupopoliplast.com.ar', 'secreto', 1000);
  assert.equal(verifyState(state, 'secreto', 2000), 'felipe@grupopoliplast.com.ar');
  assert.equal(verifyState(state, 'otro', 2000), null);
  assert.equal(verifyState(state, 'secreto', 1000 + 16 * 60 * 1000), null);
  assert.equal(verifyState(`${state}x`, 'secreto', 2000), null);
  assert.equal(verifyState('', 'secreto'), null);
});

test('el mail sale del id_token y se descarta si no está verificado', () => {
  const token = (payload) => `a.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c`;
  assert.equal(emailFromIdToken(token({ email: 'Ana@grupopoliplast.com.ar', email_verified: true })), 'ana@grupopoliplast.com.ar');
  assert.equal(emailFromIdToken(token({ email: 'x@y.com', email_verified: false })), '');
  assert.equal(emailFromIdToken('basura'), '');
});

test('respuestas del hilo: ignora lo propio, detecta rebotes y clasifica', () => {
  const msg = (from, snippet, subject = 'Re: hola') => ({ id: from + snippet, internalDate: '1793000000000', snippet, payload: { headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }] } });
  const thread = { messages: [msg('Felipe <felipe@grupopoliplast.com.ar>', 'Hola'), msg('Sur <ventas@sur.com.ar>', 'Me interesa, pasame precio'), msg('Mail Delivery Subsystem <mailer-daemon@googlemail.com>', 'Address not found')] };
  const replies = repliesInThread(thread, 'felipe@grupopoliplast.com.ar');
  assert.deepEqual(replies.map((r) => r.kind), ['interesado', 'rebote']);
});

test('applyReplies: baja va a No contactar, rebote y respuesta frenan los recordatorios', () => {
  const base = { prospectId: 'p1', company: 'Sur', to: 'ventas@sur.com.ar' };
  const outbox = [{ ...base, id: 'p1:1', step: 1, state: 'enviado' }, { ...base, id: 'p1:2', step: 2, state: 'aprobado' }, { ...base, id: 'p1:3', step: 3, state: 'borrador' }];
  const baja = applyReplies(outbox, [], [{ itemId: 'p1:1', to: base.to, company: 'Sur', kind: 'baja', action: 'Pasar a No contactar', snippet: 'BAJA' }], { by: 'felipe' });
  assert.ok(baja.doNotContact.some((e) => e.value === base.to));
  assert.deepEqual(baja.outbox.map((i) => i.state), ['enviado', 'descartado', 'descartado']);
  assert.equal(baja.outbox[0].reply.kind, 'baja');
  const interesado = applyReplies(outbox, [], [{ itemId: 'p1:1', to: base.to, kind: 'interesado', action: 'Crear tarea y responder', snippet: 'precio' }]);
  assert.deepEqual(interesado.doNotContact, []);
  assert.deepEqual(interesado.outbox.map((i) => i.state), ['enviado', 'descartado', 'descartado']);
});

// Servidor con Supabase y Google simulados.
function fakeWorld({ sends = [], blocked = [], account = { email: 'ana@grupopoliplast.com.ar', refresh_token: 'r', paused: false } } = {}) {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const u = String(url);
    const json = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body, headers: { get: () => '0/' + sends.length } });
    if (u.endsWith('/auth/v1/user')) return json({ id: 'u1', email: 'ana@grupopoliplast.com.ar' });
    if (u.includes('/gmail_accounts')) return json(account ? [account] : []);
    if (u.includes('/workspace_states')) return json([{ data: { doNotContact: blocked } }]);
    if (u.includes('/gmail_sends') && options.method === 'HEAD') return json([]);
    if (u.includes('/gmail_sends') && options.method === 'POST') return json([]);
    if (u.includes('/gmail_sends')) return json(sends.filter((row) => !u.includes('item_id=eq.') || u.includes(`item_id=eq.${encodeURIComponent(row.item_id)}`)));
    if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'at' });
    if (u.includes('/messages/send')) return json({ id: 'm1', threadId: 't1' });
    return json({}, false);
  };
  return { http, calls };
}
const env = { ...ENV, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const req = (body) => ({ headers: { authorization: 'Bearer t' }, body });
const sendItem = { id: 'p1:1', prospectId: 'p1', to: 'ventas@sur.com.ar', company: 'Sur', step: 1, state: 'aprobado', subject: 'Hola', body: 'Texto' };

test('enviar: sale por Gmail y queda registrado', async () => {
  const world = fakeWorld();
  const result = await gmailAdmin(req({ op: 'send', item: sendItem }), env, world.http, monday10);
  assert.equal(result.body.sent, true);
  assert.ok(world.calls.some((c) => c.url.includes('/messages/send')));
  assert.ok(world.calls.some((c) => c.url.includes('/gmail_sends') && c.options.method === 'POST'));
});

test('enviar: frena por No contactar leído del servidor, sin llamar a Gmail', async () => {
  const world = fakeWorld({ blocked: addBlock([], { email: sendItem.to }).list });
  const result = await gmailAdmin(req({ op: 'send', item: sendItem }), env, world.http, monday10);
  assert.equal(result.body.sent, false);
  assert.match(result.body.reason, /No contactar/);
  assert.ok(!world.calls.some((c) => c.url.includes('/messages/send')));
});

test('enviar: fuera de horario, en pausa y repetido no salen', async () => {
  const night = new Date('2026-11-02T23:00:00Z');
  assert.match((await gmailAdmin(req({ op: 'send', item: sendItem }), env, fakeWorld().http, night)).body.reason, /horario/);
  assert.match((await gmailAdmin(req({ op: 'send', item: sendItem }), env, fakeWorld({ account: { email: 'a', refresh_token: 'r', paused: true } }).http, monday10)).body.reason, /pausa/);
  const dup = await gmailAdmin(req({ op: 'send', item: sendItem }), env, fakeWorld({ sends: [{ item_id: 'p1:1', to_email: sendItem.to }] }).http, monday10);
  assert.equal(dup.status, 409);
});

test('sin credenciales de Google el panel queda apagado y sin conexión pide conectar', async () => {
  assert.equal((await gmailAdmin(req({ op: 'status' }), { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }, fakeWorld().http)).body.enabled, false);
  const noAccount = await gmailAdmin(req({ op: 'send', item: sendItem }), env, fakeWorld({ account: null }).http, monday10);
  assert.equal(noAccount.body.code, 'sin_conexion');
});
