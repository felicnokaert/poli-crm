import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, cleanPin, requestPhoneCode, verifyPhoneCode, registerPhone } from '../lib/meta-register.mjs';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('código y PIN se validan', () => {
  assert.equal(cleanCode('123-456'), '123456');
  assert.equal(cleanCode('12345'), '');
  assert.equal(cleanPin('123456'), '123456');
  assert.equal(cleanPin('12ab56'), '');
});

test('pide el código por SMS o llamada con el token en el encabezado', async () => {
  const calls = [];
  const http = async (url, options) => { calls.push({ url, options }); return reply(200, { success: true }); };
  assert.equal((await requestPhoneCode({ phoneId: '111', token: 'tok', http })).ok, true);
  assert.match(calls[0].url, /\/111\/request_code$/);
  assert.equal(JSON.parse(calls[0].options.body).code_method, 'SMS');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
  await requestPhoneCode({ phoneId: '111', token: 'tok', method: 'VOICE', http });
  assert.equal(JSON.parse(calls[1].options.body).code_method, 'VOICE');
});

test('un error de Meta vuelve como texto y nunca con el token', async () => {
  const http = async () => reply(400, { error: { message: 'Código incorrecto' } });
  const result = await verifyPhoneCode({ phoneId: '111', token: 'tok-secreto', code: '111222', http });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Código incorrecto');
  assert.ok(!JSON.stringify(result).includes('tok-secreto'));
  assert.equal((await verifyPhoneCode({ phoneId: '111', token: 'tok', code: '12', http })).ok, false);
});

test('registrar usa el PIN y después suscribe la app a la cuenta', async () => {
  const calls = [];
  const http = async (url, options) => { calls.push(url); return reply(200, { success: true }); };
  const result = await registerPhone({ phoneId: '111', wabaId: '999', token: 'tok', pin: '654321', http });
  assert.equal(result.ok, true);
  assert.equal(result.subscribed, true);
  assert.match(calls[0], /\/111\/register$/);
  assert.match(calls[1], /\/999\/subscribed_apps$/);
  assert.equal((await registerPhone({ phoneId: '111', wabaId: '999', token: 'tok', pin: '12', http })).ok, false);
});
