import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSmart } from '../src/text-decode.mjs';

test('decodes a UTF-8 buffer as-is', () => {
  const buffer = new TextEncoder().encode('Razón Social;CUIT\nAcentúa Ñoño S.A.;123');
  assert.equal(decodeSmart(buffer), 'Razón Social;CUIT\nAcentúa Ñoño S.A.;123');
});

test('falls back to Windows-1252 when UTF-8 decoding produces replacement characters', () => {
  const latin1 = new TextEncoder('windows-1252');
  // Construimos bytes Latin-1 a mano para "Razón" sin depender de un encoder externo.
  const bytes = new Uint8Array([0x52, 0x61, 0x7a, 0xf3, 0x6e]); // "Raz" + ó (0xF3 en Latin-1) + "n"
  const text = decodeSmart(bytes);
  assert.equal(text, 'Razón');
});
