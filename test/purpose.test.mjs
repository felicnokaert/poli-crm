import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PURPOSE, PERSONAL_PURPOSE_KEY, PURPOSE_KEY, cleanPurpose, readPurpose, writePurpose } from '../src/purpose.mjs';

const fakeStorage = () => { const data = new Map(); return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) }; };

test('de fábrica el propósito es el elegido y se limpia lo que se escribe', () => {
  assert.equal(readPurpose(fakeStorage()), DEFAULT_PURPOSE);
  assert.equal(cleanPurpose('  hola   mundo \n '), 'hola mundo');
  assert.equal(cleanPurpose('x'.repeat(500)).length, 160);
});

test('lo guardado manda y vaciarlo vuelve a la fábrica; el personal puede quedar vacío', () => {
  const storage = fakeStorage();
  writePurpose(storage, PURPOSE_KEY, 'Que todo salga bien');
  assert.equal(readPurpose(storage), 'Que todo salga bien');
  writePurpose(storage, PURPOSE_KEY, '   ');
  assert.equal(readPurpose(storage), DEFAULT_PURPOSE);
  assert.equal(readPurpose(storage, PERSONAL_PURPOSE_KEY, ''), '');
});

test('si el almacenamiento falla no rompe', () => {
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  assert.equal(readPurpose(broken), DEFAULT_PURPOSE);
  assert.equal(writePurpose(broken, PURPOSE_KEY, 'algo'), 'algo');
});
