import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256Hex } from '../src/file-hash.mjs';

test('sha256Hex calcula el hash SHA-256 correcto de un archivo, en hexadecimal', async () => {
  // sha256("hola") = precalculado con node -e "require('crypto').createHash('sha256').update('hola').digest('hex')"
  const file = new Blob(['hola']);
  const hash = await sha256Hex(file);
  assert.equal(hash, 'b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79');
});

test('sha256Hex devuelve el mismo hash para el mismo contenido y distinto para contenido distinto', async () => {
  const hashA = await sha256Hex(new Blob(['contenido']));
  const hashB = await sha256Hex(new Blob(['contenido']));
  const hashC = await sha256Hex(new Blob(['otro contenido']));
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
});

test('sha256Hex de un archivo vacío es el hash conocido de la cadena vacía', async () => {
  const hash = await sha256Hex(new Blob([]));
  assert.equal(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
