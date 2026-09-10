export const DOCUMENT_STATUSES = Object.freeze([
  'inventariado',
  'posible_duplicado',
  'pendiente_validacion',
  'vigente',
  'desactualizado',
  'no_tecnico',
]);

export const TECHNICAL_FACT_TYPES = Object.freeze([
  'aplicacion',
  'compatibilidad',
  'dosificacion',
  'rendimiento',
  'seguridad',
]);

export function normalizeDocumentName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?)$/i, '')
    .replace(/\b(copia|copy|final|nuevo|actualizado|version|v\d+)\b/g, ' ')
    .replace(/\(\d+\)|[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function exactDuplicateKey(document = {}) {
  const hash = String(document.sha256 || '').trim().toLowerCase();
  return hash ? `sha256:${hash}` : null;
}

export function possibleDuplicateKey(document = {}) {
  const normalizedName = normalizeDocumentName(document.title || document.sourceFile || '');
  const size = Number(document.sizeBytes || 0);
  if (!normalizedName) return null;
  return `${normalizedName}|${size || 'sin-tamano'}`;
}

export function groupDuplicateCandidates(documents = []) {
  const exact = new Map();
  const possible = new Map();
  for (const document of documents) {
    const exactKey = exactDuplicateKey(document);
    const possibleKey = possibleDuplicateKey(document);
    if (exactKey) exact.set(exactKey, [...(exact.get(exactKey) || []), document]);
    if (possibleKey) possible.set(possibleKey, [...(possible.get(possibleKey) || []), document]);
  }
  return {
    exact: [...exact.values()].filter((group) => group.length > 1),
    possible: [...possible.values()].filter((group) => group.length > 1),
  };
}

export function buildTechnicalDocument(input = {}) {
  const status = DOCUMENT_STATUSES.includes(input.status) ? input.status : 'inventariado';
  return {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    family: String(input.family || 'Sin definir').trim(),
    product: String(input.product || '').trim(),
    sku: String(input.sku || '').trim(),
    docType: String(input.docType || 'sin_clasificar').trim(),
    source: String(input.source || 'drive').trim(),
    sourceUrl: String(input.sourceUrl || '').trim(),
    sourceFile: String(input.sourceFile || '').trim(),
    sourceUpdatedAt: input.sourceUpdatedAt || null,
    version: input.version || null,
    language: input.language || null,
    sha256: input.sha256 || null,
    sizeBytes: Number(input.sizeBytes || 0) || null,
    status,
    verifiedBy: input.verifiedBy || null,
    verifiedAt: input.verifiedAt || null,
    replacedBy: input.replacedBy || null,
    notes: String(input.notes || '').trim(),
    extractedText: input.extractedText || null,
  };
}

export function canCiteTechnicalFact(document = {}, factType = '') {
  return document.status === 'vigente'
    && Boolean(document.sourceUrl || document.sourceFile)
    && TECHNICAL_FACT_TYPES.includes(factType)
    && Boolean(document.verifiedBy && document.verifiedAt);
}

export function citationDecision(document = {}, factType = '') {
  if (canCiteTechnicalFact(document, factType)) {
    return { allowed: true, reason: 'fuente_tecnica_vigente_y_validada' };
  }
  if (!TECHNICAL_FACT_TYPES.includes(factType)) {
    return { allowed: false, reason: 'tipo_de_dato_no_tecnico_o_desconocido' };
  }
  if (document.status !== 'vigente') {
    return { allowed: false, reason: 'documento_no_vigente' };
  }
  return { allowed: false, reason: 'documento_sin_fuente_o_validacion' };
}

// Búsqueda por palabra clave sobre el texto ya extraído de la ficha, nunca
// una interpretación: el motor solo puede citar una línea que está
// literalmente en el documento, no puede resumir ni inferir. Si ninguna
// línea coincide, no hay cita - queda "pendiente de verificar" como antes.
const FACT_KEYWORD_PATTERNS = {
  rendimiento: [/rendimiento/i, /kg\s*\/?\s*m[²2]/i, /cobertura/i, /m[²2]\s*por/i, /litros?\s*por/i],
  compatibilidad: [/compatib/i, /no (debe|se debe) (usarse|aplicarse|mezclarse)/i, /sustrato/i],
  dosificacion: [/dosifi/i, /proporci[oó]n/i, /relaci[oó]n\s*\d/i, /mezcla/i, /partes? (a|de) \d/i],
  aplicacion: [/modo de (uso|aplicaci[oó]n)/i, /aplicaci[oó]n/i, /c[oó]mo aplicar/i, /forma de (uso|aplicar)/i],
  seguridad: [/seguridad/i, /precauci[oó]n/i, /\bepp\b/i, /ventilaci[oó]n/i, /inflamable/i, /riesgo/i, /manipuleo/i],
};

export function extractFactExcerpt(text = '', factType = '') {
  const patterns = FACT_KEYWORD_PATTERNS[factType];
  if (!patterns || !text) return null;
  const lines = String(text).split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (patterns.some((pattern) => pattern.test(lines[index]))) {
      return [lines[index], lines[index + 1]].filter(Boolean).join(' ').slice(0, 280).trim();
    }
  }
  return null;
}

// Combina la regla de gobernanza (¿se puede citar esta ficha para este dato?)
// con la búsqueda literal en el texto - si cualquiera de las dos falla, no
// hay cita. Es la única puerta por la que un dato técnico puntual puede
// llegar al copiloto sin ser inventado.
export function citableExcerpt(document = {}, factType = '') {
  const decision = citationDecision(document, factType);
  if (!decision.allowed) return null;
  const excerpt = extractFactExcerpt(document.extractedText, factType);
  if (!excerpt) return null;
  return { excerpt, source: document.product || document.title || document.sourceFile, ...decision };
}
