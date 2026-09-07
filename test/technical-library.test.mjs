import assert from 'node:assert/strict';
import test from 'node:test';
import { TECHNICAL_LIBRARY, documentsForFamily, findDocumentById, docTypeLabel } from '../src/technical-library.mjs';
import { FAMILIES } from '../src/families.mjs';

test('every technical library entry has the required metadata fields, no PDF content', () => {
  for (const doc of TECHNICAL_LIBRARY) {
    assert.equal(typeof doc.id, 'string');
    assert.ok(doc.id.length > 0);
    assert.equal(typeof doc.family, 'string');
    assert.equal(typeof doc.product, 'string');
    assert.equal(typeof doc.docType, 'string');
    assert.equal(typeof doc.sourceFile, 'string');
    assert.equal(doc.verified, false);
    assert.ok(!('content' in doc));
    assert.ok(!('text' in doc));
  }
});

test('technical library ids are unique', () => {
  const ids = TECHNICAL_LIBRARY.map((doc) => doc.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every technical library family is a known commercial family', () => {
  for (const doc of TECHNICAL_LIBRARY) {
    assert.ok(FAMILIES.includes(doc.family), `${doc.id} has unknown family "${doc.family}"`);
  }
});

test('no document is marked verified yet (fase 1: sin contenido validado)', () => {
  assert.ok(TECHNICAL_LIBRARY.every((doc) => doc.verified === false));
});

test('documentsForFamily filters by family', () => {
  const poliuretanoDocs = documentsForFamily('Poliuretano');
  assert.ok(poliuretanoDocs.length > 0);
  assert.ok(poliuretanoDocs.every((doc) => doc.family === 'Poliuretano'));
  assert.equal(documentsForFamily('Familia inexistente').length, 0);
});

test('findDocumentById returns the matching doc or null', () => {
  const first = TECHNICAL_LIBRARY[0];
  assert.deepEqual(findDocumentById(first.id), first);
  assert.equal(findDocumentById('no-existe'), null);
});

test('docTypeLabel returns a human label and falls back to the raw value', () => {
  assert.equal(docTypeLabel('ficha_tecnica'), 'Ficha técnica');
  assert.equal(docTypeLabel('fds'), 'Ficha de seguridad (FDS)');
  assert.equal(docTypeLabel('tipo-desconocido'), 'tipo-desconocido');
});
