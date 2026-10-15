import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_REPLIES, REPLY_TEMPLATES } from '../src/knowledge.js';

test('cada respuesta rápida tiene su mensaje listo, sin precios ni números inventados', () => {
  for (const [channel, replies] of Object.entries(QUICK_REPLIES)) {
    for (const [title] of replies) {
      const text = REPLY_TEMPLATES[channel]?.[title];
      assert.ok(text, `falta el mensaje de ${channel} / ${title}`);
      assert.doesNotMatch(text, /\$|USD|%|descuento/i, `${title} no debe traer precios`);
    }
  }
});
