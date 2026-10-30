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
