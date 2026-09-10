import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyInventoryImport, inventoryImportSummary } from '../src/technical-inventory-import.mjs';

test('a candidate with no prior match is classified as new, never as vigente', () => {
  const preview = classifyInventoryImport([
    { title: 'isoBUNKER 619-SP', family: 'Poliuretano', product: 'isoBUNKER 619-SP', sourceFile: 'a.pdf', sha256: 'aaa', sizeBytes: 100 },
  ], []);
  assert.equal(preview.new.length, 1);
  assert.equal(preview.new[0].status, 'inventariado');
  assert.equal(preview.new[0].verifiedBy, null);
});

test('exact hash match is reported as an exact duplicate, not silently skipped or merged', () => {
  const existing = [{ id: 'x', title: 'isoBUNKER 619-SP', family: 'Poliuretano', sha256: 'AAA', sizeBytes: 100 }];
  const preview = classifyInventoryImport([
    { title: 'isoBUNKER 619-SP (1)', family: 'Poliuretano', sha256: 'aaa', sizeBytes: 100 },
  ], existing);
  assert.equal(preview.exactDuplicates.length, 1);
  assert.equal(preview.new.length, 0);
  assert.equal(preview.exactDuplicates[0].existing.id, 'x');
});

test('same logical document with a different hash is "modified", not auto-replaced', () => {
  const existing = [{ id: 'x', title: 'Ficha PMA-200', family: 'PURMAC', product: 'PMA-200', sha256: 'old-hash', sizeBytes: 200 }];
  const preview = classifyInventoryImport([
    { title: 'Ficha PMA-200', family: 'PURMAC', product: 'PMA-200', sha256: 'new-hash', sizeBytes: 250 },
  ], existing);
  assert.equal(preview.modified.length, 1);
  assert.equal(preview.exactDuplicates.length, 0);
  assert.equal(preview.new.length, 0);
});

test('similar name and same size is only a possible duplicate, never auto-resolved', () => {
  const existing = [{ id: 'x', title: 'Manual PMA 200 final.pdf', family: 'PURMAC', sizeBytes: 5000 }];
  const preview = classifyInventoryImport([
    { title: 'Manual_PMA_200 copia.pdf', family: 'PURMAC', product: 'Otro producto', sizeBytes: 5000 },
  ], existing);
  assert.equal(preview.possibleDuplicates.length, 1);
  assert.equal(preview.new.length, 0);
  assert.equal(preview.modified.length, 0);
});

test('detects duplicates within the same import batch, not only against what was already indexed', () => {
  // Caso real del piloto: la misma ficha guardada en dos carpetas de Drive,
  // primera vez que se importa (existingDocuments vacío).
  const preview = classifyInventoryImport([
    { title: 'Ficha Manta Purmac final', family: 'PURMAC', product: 'Manta calefactora', sourceFile: 'a/Ficha.pdf', sha256: 'same-hash', sizeBytes: 2478460 },
    { title: 'Ficha Manta Purmac final', family: 'PURMAC', product: 'Manta calefactora', sourceFile: 'b/Ficha.pdf', sha256: 'same-hash', sizeBytes: 2478460 },
  ], []);
  assert.equal(preview.new.length, 1);
  assert.equal(preview.exactDuplicates.length, 1);
});

test('a candidate without family is an error, not silently defaulted', () => {
  const preview = classifyInventoryImport([{ title: 'Ficha sin familia', sourceFile: 'x.pdf' }], []);
  assert.equal(preview.errors.length, 1);
  assert.equal(preview.errors[0].reason, 'sin_familia_asignada');
});

test('a candidate without title or source file is an error', () => {
  const preview = classifyInventoryImport([{ family: 'Poliuretano' }], []);
  assert.equal(preview.errors.length, 1);
  assert.equal(preview.errors[0].reason, 'sin_nombre_ni_archivo_fuente');
});

test('handles an empty batch and empty existing catalog without throwing', () => {
  assert.doesNotThrow(() => classifyInventoryImport());
  assert.deepEqual(inventoryImportSummary(classifyInventoryImport()), { nuevos: 0, modificados: 0, duplicadosExactos: 0, posiblesDuplicados: 0, errores: 0 });
});

test('inventoryImportSummary counts each category independently', () => {
  const existing = [
    { id: 'exact', title: 'A', family: 'Poliuretano', sha256: 'same', sizeBytes: 1 },
    { id: 'modified', title: 'B', family: 'Poliuretano', product: 'B', sha256: 'old', sizeBytes: 1 },
    { id: 'possible', title: 'C original.pdf', family: 'Poliuretano', sizeBytes: 9 },
  ];
  const preview = classifyInventoryImport([
    { title: 'A', family: 'Poliuretano', sha256: 'same', sizeBytes: 1 },
    { title: 'B', family: 'Poliuretano', product: 'B', sha256: 'new', sizeBytes: 1 },
    { title: 'C_original copia.pdf', family: 'Poliuretano', product: 'Producto distinto', sizeBytes: 9 },
    { title: 'D nuevo', family: 'Poliuretano' },
    { family: '' },
  ], existing);
  assert.deepEqual(inventoryImportSummary(preview), { nuevos: 1, modificados: 1, duplicadosExactos: 1, posiblesDuplicados: 1, errores: 1 });
});
