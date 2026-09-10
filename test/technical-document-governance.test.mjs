import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTechnicalDocument,
  canCiteTechnicalFact,
  citableExcerpt,
  citationDecision,
  extractFactExcerpt,
  groupDuplicateCandidates,
  normalizeDocumentName,
} from '../src/technical-document-governance.mjs';

test('normaliza nombres frecuentes sin confundir el contenido con la vigencia', () => {
  assert.equal(normalizeDocumentName('Ficha Técnica Manta PURMAC-final (1).pdf'), 'ficha tecnica manta purmac');
  assert.equal(normalizeDocumentName('FICHA_TECNICA_MANTA_PURMAC copia.docx'), 'ficha tecnica manta purmac');
});

test('detecta duplicados exactos solo cuando comparten hash', () => {
  const documents = [
    { id: 'a', title: 'Ficha A.pdf', sha256: 'ABC', sizeBytes: 10 },
    { id: 'b', title: 'Copia.pdf', sha256: 'abc', sizeBytes: 10 },
    { id: 'c', title: 'Ficha A nueva.pdf', sha256: 'def', sizeBytes: 10 },
  ];
  const groups = groupDuplicateCandidates(documents);
  assert.equal(groups.exact.length, 1);
  assert.deepEqual(groups.exact[0].map((item) => item.id), ['a', 'b']);
});

test('un nombre similar es candidato y nunca autoriza borrado automatico', () => {
  const documents = [
    { id: 'a', title: 'Manual PMA 200 final.pdf', sizeBytes: 100 },
    { id: 'b', title: 'Manual_PMA_200 copia.pdf', sizeBytes: 100 },
  ];
  const groups = groupDuplicateCandidates(documents);
  assert.equal(groups.possible.length, 1);
  assert.equal(groups.exact.length, 0);
});

test('un documento nuevo queda inventariado y no verificado', () => {
  const document = buildTechnicalDocument({ id: 'x', title: 'Ficha X' });
  assert.equal(document.status, 'inventariado');
  assert.equal(document.verifiedBy, null);
  assert.equal(document.verifiedAt, null);
});

test('solo permite citar datos tecnicos con documento vigente, fuente y validacion', () => {
  const verified = buildTechnicalDocument({
    id: 'x',
    title: 'Ficha X',
    status: 'vigente',
    sourceUrl: 'https://drive.google.com/file/d/x/view',
    verifiedBy: 'Felipe',
    verifiedAt: '2026-09-10T00:00:00Z',
  });
  assert.equal(canCiteTechnicalFact(verified, 'rendimiento'), true);
  assert.equal(canCiteTechnicalFact(verified, 'precio'), false);
  assert.deepEqual(citationDecision({ ...verified, status: 'pendiente_validacion' }, 'seguridad'), {
    allowed: false,
    reason: 'documento_no_vigente',
  });
});

test('extractFactExcerpt solo cita una linea que existe literalmente en el texto, nunca inventa ni resume', () => {
  const text = [
    'FICHA TECNICA isoBUNKER 619-SP',
    'Densidad libre: 35 kg/m3',
    'Rendimiento: 1 kg de mezcla rinde aproximadamente 30 litros de espuma expandida',
    'Almacenar en lugar fresco y seco',
  ].join('\n');
  assert.equal(
    extractFactExcerpt(text, 'rendimiento'),
    'Rendimiento: 1 kg de mezcla rinde aproximadamente 30 litros de espuma expandida Almacenar en lugar fresco y seco',
  );
  assert.equal(extractFactExcerpt(text, 'compatibilidad'), null);
  assert.equal(extractFactExcerpt('', 'rendimiento'), null);
  assert.equal(extractFactExcerpt(text, 'tipo_inventado'), null);
});

test('citableExcerpt nunca cita de un documento no vigente/no validado, aunque el texto tenga la palabra clave', () => {
  const text = 'Rendimiento: 30 litros por kg';
  const notVerified = buildTechnicalDocument({ id: 'a', title: 'Ficha A', status: 'inventariado', extractedText: text });
  assert.equal(citableExcerpt(notVerified, 'rendimiento'), null);

  const verifiedNoText = buildTechnicalDocument({
    id: 'b', title: 'Ficha B', status: 'vigente', sourceUrl: 'https://drive/x',
    verifiedBy: 'Felipe', verifiedAt: '2026-09-10T00:00:00Z',
  });
  assert.equal(citableExcerpt(verifiedNoText, 'rendimiento'), null);

  const verifiedWithText = buildTechnicalDocument({
    id: 'c', title: 'Ficha C', product: 'isoBUNKER 619-SP', status: 'vigente', sourceUrl: 'https://drive/x',
    verifiedBy: 'Felipe', verifiedAt: '2026-09-10T00:00:00Z', extractedText: text,
  });
  const cited = citableExcerpt(verifiedWithText, 'rendimiento');
  assert.equal(cited.excerpt, 'Rendimiento: 30 litros por kg');
  assert.equal(cited.source, 'isoBUNKER 619-SP');
  assert.equal(cited.allowed, true);
});
