import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTechnicalDocument } from '../src/technical-document-governance.mjs';
import { fromRow, guessFamilyFromPath, historyFromRow, isTechnicalDocumentAdmin, parsePathHints, toRow } from '../src/technical-documents-mapping.mjs';

test('toRow maps a built document to snake_case columns, defaulting to inventariado', () => {
  const document = buildTechnicalDocument({ title: 'isoBUNKER 619-SP', family: 'Poliuretano', product: 'isoBUNKER 619-SP', sourceFile: 'a.pdf', sha256: 'abc', sizeBytes: 100 });
  const row = toRow(document);
  assert.equal(row.title, 'isoBUNKER 619-SP');
  assert.equal(row.doc_type, 'sin_clasificar');
  assert.equal(row.source_file, 'a.pdf');
  assert.equal(row.size_bytes, 100);
  assert.equal(row.status, 'inventariado');
});

test('toRow never sends verified_by/verified_at - only status changes through updateTechnicalDocumentStatus do', () => {
  const row = toRow(buildTechnicalDocument({ title: 'x', family: 'PURMAC' }));
  assert.ok(!('verified_by' in row));
  assert.ok(!('verified_at' in row));
});

test('fromRow maps a Supabase row back to camelCase, including audit fields', () => {
  const row = {
    id: 'uuid-1', title: 'Ficha X', family: 'PURMAC', product: 'P', sku: '', doc_type: 'manual',
    source: 'drive', source_url: '', source_file: 'x.pdf', source_updated_at: null,
    version: null, language: null, sha256: 'abc', size_bytes: 10, status: 'vigente',
    verified_by: 'user-1', verified_by_email: 'felipe@grupopoliplast.com.ar', verified_at: '2026-09-10T00:00:00Z',
    replaced_by: null, notes: 'ok', created_by_email: 'x@grupopoliplast.com.ar',
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-10T00:00:00Z',
  };
  const doc = fromRow(row);
  assert.equal(doc.id, 'uuid-1');
  assert.equal(doc.docType, 'manual');
  assert.equal(doc.verifiedByEmail, 'felipe@grupopoliplast.com.ar');
  assert.equal(doc.status, 'vigente');
});

test('historyFromRow maps an audit row to camelCase', () => {
  const entry = historyFromRow({ id: 'h1', document_id: 'd1', previous_status: 'inventariado', new_status: 'vigente', changed_by_email: 'felipe@grupopoliplast.com.ar', note: '', changed_at: '2026-09-10T00:00:00Z' });
  assert.equal(entry.documentId, 'd1');
  assert.equal(entry.previousStatus, 'inventariado');
  assert.equal(entry.newStatus, 'vigente');
});

test('isTechnicalDocumentAdmin only allows the same two accounts as the DB-level admin check, case-insensitively', () => {
  assert.equal(isTechnicalDocumentAdmin('felipe@grupopoliplast.com.ar'), true);
  assert.equal(isTechnicalDocumentAdmin('Felipe@GrupoPoliplast.com.ar'), true);
  assert.equal(isTechnicalDocumentAdmin('felipecnokaert@gmail.com'), true);
  assert.equal(isTechnicalDocumentAdmin('juan@grupopoliplast.com.ar'), false);
  assert.equal(isTechnicalDocumentAdmin('info@grupopoliplast.com.ar'), false);
  assert.equal(isTechnicalDocumentAdmin(''), false);
});

test('guessFamilyFromPath suggests a family from folder names, never leaves it blank', () => {
  assert.equal(guessFamilyFromPath('MAQUINAS/Airless 390.pdf'), 'PURMAC');
  assert.equal(guessFamilyFromPath('PRODUCTOS/POLIURETANOS RIGIDOS/Ficha X.pdf'), 'Poliuretano');
  assert.equal(guessFamilyFromPath('PRODUCTOS/RESINAS/Ficha.pdf'), 'Resinplast');
  assert.equal(guessFamilyFromPath('algo/sin/pista.pdf'), 'Otra');
  assert.equal(guessFamilyFromPath(''), 'Otra');
});

test('parsePathHints derives title/product/family from a relative path, all meant to be edited before saving', () => {
  const hints = parsePathHints('PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 619 SP/PDS isoBUNKER 619-SP.pdf');
  assert.equal(hints.title, 'PDS isoBUNKER 619-SP');
  assert.equal(hints.product, 'Ficha Técnica 619 SP');
  assert.equal(hints.family, 'Poliuretano');
});

test('parsePathHints handles a flat file with no folder (regular multi-file picker, not a folder picker)', () => {
  const hints = parsePathHints('Airless 390.pdf');
  assert.equal(hints.title, 'Airless 390');
  assert.equal(hints.product, '');
  assert.equal(hints.family, 'Otra');
});

test('toRow/fromRow round-trip preserves the fields that matter for the preview', () => {
  const document = buildTechnicalDocument({ title: 'Manual PMA-200', family: 'PURMAC', product: 'PMA-200', docType: 'manual', sourceFile: 'x.docx', sha256: 'hash', sizeBytes: 5000 });
  const row = toRow(document);
  const back = fromRow({ ...row, id: 'new-id', created_at: 'now', updated_at: 'now' });
  assert.equal(back.title, document.title);
  assert.equal(back.family, document.family);
  assert.equal(back.docType, document.docType);
  assert.equal(back.sha256, document.sha256);
  assert.equal(back.sizeBytes, document.sizeBytes);
});
