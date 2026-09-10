// Importador de inventario de la base técnica — vista previa antes de
// guardar, según docs/BASE_CONOCIMIENTO_TECNICA_SPEC.md (secciones 5 y 8).
//
// Este módulo NO toca Drive, NO decide qué documento queda "vigente" y NO
// persiste nada por sí mismo. Solo clasifica una lista de candidatos
// (archivos detectados en una carpeta/Drive, con su hash y tamaño ya
// calculados) contra lo que el CRM ya tiene indexado, para que una persona
// decida qué hacer con cada caso antes de guardar.
import { buildTechnicalDocument, exactDuplicateKey, normalizeDocumentName, possibleDuplicateKey } from './technical-document-governance.mjs';

// "Mismo documento lógico" = mismo nombre normalizado, familia y producto,
// sin importar el contenido. Sirve para distinguir "esto ya lo tenemos, pero
// el archivo cambió" (modificado) de "esto es dos archivos distintos que
// casualmente se llaman parecido" (posible duplicado, ver Sección 5).
function identityKey(document = {}) {
  const name = normalizeDocumentName(document.title || document.sourceFile || '');
  if (!name) return null;
  return `${name}|${String(document.family || '').trim().toLowerCase()}|${String(document.product || '').trim().toLowerCase()}`;
}

function indexExisting(existingDocuments = []) {
  const byExactHash = new Map();
  const byIdentity = new Map();
  const byPossibleKey = new Map();
  for (const document of existingDocuments) {
    const exactKey = exactDuplicateKey(document);
    if (exactKey) byExactHash.set(exactKey, document);
    const identity = identityKey(document);
    if (identity) byIdentity.set(identity, document);
    const possibleKey = possibleDuplicateKey(document);
    if (possibleKey) byPossibleKey.set(possibleKey, [...(byPossibleKey.get(possibleKey) || []), document]);
  }
  return { byExactHash, byIdentity, byPossibleKey };
}

// candidates: archivos detectados (sin guardar todavía), con la misma forma
// que buildTechnicalDocument espera - como mínimo title/sourceFile y family.
// existingDocuments: lo que el CRM ya tiene indexado (technical-library.mjs
// hoy, o la tabla de gobernanza el día que exista).
//
// Devuelve la clasificación exigida por la Sección 4 de la spec: nuevos,
// modificados, duplicados exactos, posibles duplicados y errores. Ninguna
// categoría se guarda automáticamente - esto es solo la vista previa.
//
// Un mismo lote de importación puede traer duplicados entre sí (pasó en el
// piloto real: la misma ficha guardada en dos carpetas de Drive) sin que
// ninguno de los dos exista todavía en existingDocuments. Por eso cada
// candidato aceptado como "nuevo" se suma a los índices antes de evaluar el
// siguiente - si no, el primer archivo de un lote nunca puede marcar como
// duplicado al segundo.
export function classifyInventoryImport(candidates = [], existingDocuments = []) {
  const { byExactHash, byIdentity, byPossibleKey } = indexExisting(existingDocuments);
  const result = { new: [], modified: [], exactDuplicates: [], possibleDuplicates: [], errors: [] };

  const addToIndex = (built) => {
    const exactKey = exactDuplicateKey(built);
    if (exactKey) byExactHash.set(exactKey, built);
    const identity = identityKey(built);
    if (identity) byIdentity.set(identity, built);
    const possibleKey = possibleDuplicateKey(built);
    if (possibleKey) byPossibleKey.set(possibleKey, [...(byPossibleKey.get(possibleKey) || []), built]);
  };

  for (const candidate of candidates) {
    if (!candidate?.title && !candidate?.sourceFile) {
      result.errors.push({ candidate, reason: 'sin_nombre_ni_archivo_fuente' });
      continue;
    }
    if (!candidate?.family) {
      result.errors.push({ candidate, reason: 'sin_familia_asignada' });
      continue;
    }
    const built = buildTechnicalDocument(candidate);

    const exactKey = exactDuplicateKey(built);
    if (exactKey && byExactHash.has(exactKey)) {
      result.exactDuplicates.push({ candidate: built, existing: byExactHash.get(exactKey) });
      continue;
    }

    const identity = identityKey(built);
    const existingByIdentity = identity ? byIdentity.get(identity) : null;
    if (existingByIdentity) {
      // Mismo documento lógico (nombre+familia+producto), pero el hash no
      // coincide con lo ya indexado - el archivo cambió de contenido. No se
      // reemplaza solo: queda para que una persona confirme la actualización
      // (Sección 5 de la spec, "versiones distintas: conservar ambas y
      // vincular replacedBy").
      result.modified.push({ candidate: built, existing: existingByIdentity });
      continue;
    }

    const possibleKey = possibleDuplicateKey(built);
    const possibleMatches = possibleKey ? byPossibleKey.get(possibleKey) : null;
    if (possibleMatches?.length) {
      result.possibleDuplicates.push({ candidate: built, existing: possibleMatches });
      continue;
    }

    result.new.push(built);
    addToIndex(built);
  }
  return result;
}

export function inventoryImportSummary(preview) {
  return {
    nuevos: preview.new.length,
    modificados: preview.modified.length,
    duplicadosExactos: preview.exactDuplicates.length,
    posiblesDuplicados: preview.possibleDuplicates.length,
    errores: preview.errors.length,
  };
}
