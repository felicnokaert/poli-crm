import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneAR, checkEmail, contactQuality } from '../src/prospect-contact.mjs';

test('celular con +54 9 queda como celular y arma WhatsApp', () => {
  const r = normalizePhoneAR('+54 9 351 555-1234');
  assert.equal(r.valid, true);
  assert.equal(r.kind, 'celular');
  assert.equal(r.whatsapp, 'https://wa.me/5493515551234');
});

test('prefijo 15 y cero inicial se normalizan', () => {
  const r = normalizePhoneAR('0351 15 555 1234');
  assert.equal(r.national, '3515551234');
  assert.equal(r.mobile, true);
});

test('fijo de 10 dígitos no se afirma como celular', () => {
  const r = normalizePhoneAR('(0343) 422-1234');
  assert.equal(r.valid, true);
  assert.equal(r.mobile, false);
  assert.equal(r.whatsapp, '');
});

test('teléfonos incompletos o repetidos son inválidos', () => {
  assert.equal(normalizePhoneAR('4221234').valid, false);
  assert.equal(normalizePhoneAR('1111111111').valid, false);
  assert.equal(normalizePhoneAR('').valid, false);
});

test('mails: formato, errores de tipeo y genéricos', () => {
  assert.equal(checkEmail('juan@dominio').valid, false);
  assert.equal(checkEmail('juan@gmial.com').suggestion, 'juan@gmail.com');
  assert.equal(checkEmail('info@ferreteria.com.ar').generic, true);
  assert.equal(checkEmail('juan@ferreteria.com.ar').valid, true);
});

test('contactQuality resume y marca si hay algún dato usable', () => {
  const r = contactQuality({ phone: '123', email: 'ventas@corralon.com' });
  assert.equal(r.usable, true);
  assert.ok(r.notes.some((n) => /problema: faltan dígitos/.test(n)));
  assert.equal(contactQuality({}).usable, false);
});
