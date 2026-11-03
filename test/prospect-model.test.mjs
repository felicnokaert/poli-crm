import test from 'node:test';
import assert from 'node:assert/strict';

test('whatsappLinkWithText arma el link con el mensaje, solo para celulares argentinos válidos', async () => {
  const { whatsappLinkWithText } = await import('../src/prospect-model.mjs');
  assert.equal(whatsappLinkWithText('+54 9 11 5262-7555', 'Hola, ¿cómo estás?'), 'https://wa.me/5491152627555?text=Hola%2C%20%C2%BFc%C3%B3mo%20est%C3%A1s%3F');
  assert.equal(whatsappLinkWithText('011 4444-5555', 'Hola'), '');
  assert.equal(whatsappLinkWithText('+54 9 11 5262-7555'), 'https://wa.me/5491152627555');
});
