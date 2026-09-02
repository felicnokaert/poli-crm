import assert from 'node:assert/strict';
import test from 'node:test';

await import('../extension/unread-parser.js');
const { previewFromValues } = globalThis.PoliplastUnreadParser;

test('reads the Penosil unread preview from the accessible title when visible text only contains the phone', () => {
  assert.equal(previewFromValues({
    name: '+54 9 11 5638-7793',
    texts: ['+54 9 11 5638-7793'],
    titles: ['+54 9 11 5638-7793', '‪OK gracias otra consulta por las dudas se puede pintar arriba de este producto?‬'],
  }), 'OK gracias otra consulta por las dudas se puede pintar arriba de este producto?');
});

test('does not treat an outgoing preview or unread counter as a customer message', () => {
  assert.equal(previewFromValues({
    name: 'Felipe Poliplast',
    texts: ['Felipe Poliplast', '2 mensajes no leídos'],
    titles: ['Felipe Poliplast', 'Tú: seguimiento enviado'],
  }), '');
});

test('represents an unread Penosil voice note without inventing a transcription', () => {
  assert.equal(previewFromValues({
    name: '+54 9 3518 00-0669',
    texts: ['+54 9 3518 00-0669', '0:17'],
    titles: ['+54 9 3518 00-0669', '‪0:17‬'],
  }), '[audio · 0:17]');
});
