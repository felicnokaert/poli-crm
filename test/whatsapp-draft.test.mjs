import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftFromWhatsApp, whatsappThreadKey } from '../src/whatsapp-draft.mjs';

test('draftFromWhatsApp: familia, temperatura y etapa a partir del mensaje', () => {
  const hot = draftFromWhatsApp({ text_body: 'Necesito precio de espuma poliuretano para hoy, 200 kg', customer_name: 'Juan Pérez', channel: 'poliplast' });
  assert.equal(hot.family, 'Poliuretano');
  assert.equal(hot.temperature, 'Caliente');
  assert.equal(hot.stage, 'Apertura');
  assert.equal(hot.company, 'Juan Pérez');
  assert.equal(hot.nextAction, '');
  assert.ok(hot.triage);
  const cold = draftFromWhatsApp({ text_body: 'Hola', channel: 'poliplast' });
  assert.equal(cold.family, 'Sin definir');
  assert.equal(cold.temperature, 'Frío');
  const penosil = draftFromWhatsApp({ text_body: 'Quisiera más información', channel: 'penosil' });
  assert.equal(penosil.family, 'Penosil');
  assert.equal(penosil.temperature, 'Tibio');
  assert.equal(draftFromWhatsApp({ message_type: 'image' }).summary, '[image]');
});

test('whatsappThreadKey: mismo contacto, misma clave', () => {
  const a = { customer_phone: '5491155550000', channel: 'poliplast' };
  assert.equal(whatsappThreadKey(a), whatsappThreadKey({ ...a }));
});
