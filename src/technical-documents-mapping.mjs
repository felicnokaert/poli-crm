// Mapeo puro entre la forma de buildTechnicalDocument (camelCase, usada por
// technical-inventory-import.mjs) y las columnas de la tabla
// technical_documents en Supabase (snake_case, docs/MIGRACION_BASE_TECNICA.sql).
// Separado de technical-documents-repo.mjs para poder testearlo sin
// depender del cliente de Supabase (que solo puede inicializarse bajo Vite,
// igual que online.js).
export function toRow(document = {}) {
  return {
    title: document.title,
    family: document.family,
    product: document.product || '',
    sku: document.sku || '',
    doc_type: document.docType || 'sin_clasificar',
    source: document.source || 'drive',
    source_url: document.sourceUrl || '',
    source_file: document.sourceFile || '',
    source_updated_at: document.sourceUpdatedAt || null,
    version: document.version || null,
    language: document.language || null,
    sha256: document.sha256 || null,
    size_bytes: document.sizeBytes || null,
    status: document.status || 'inventariado',
    notes: document.notes || '',
    extracted_text: document.extractedText || null,
  };
}

export function fromRow(row = {}) {
  return {
    id: row.id,
    title: row.title,
    family: row.family,
    product: row.product,
    sku: row.sku,
    docType: row.doc_type,
    source: row.source,
    sourceUrl: row.source_url,
    sourceFile: row.source_file,
    sourceUpdatedAt: row.source_updated_at,
    version: row.version,
    language: row.language,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    status: row.status,
    verifiedBy: row.verified_by,
    verifiedByEmail: row.verified_by_email,
    verifiedAt: row.verified_at,
    replacedBy: row.replaced_by,
    notes: row.notes,
    extractedText: row.extracted_text,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Mismo criterio que public.is_poliplast_crm_admin() en
// docs/MIGRACION_BASE_TECNICA.sql - repetido acá a propósito, como en
// api/commercial-master.js/meta-subscribe.js. Es solo para la UI (mostrar u
// ocultar la opción "vigente"); la seguridad real la hace RLS del lado del
// servidor, esto nunca es lo único que protege el dato.
const TECHNICAL_DOCUMENT_ADMINS = ['felipecnokaert@gmail.com', 'felipe@grupopoliplast.com.ar'];

export function isTechnicalDocumentAdmin(email = '') {
  return TECHNICAL_DOCUMENT_ADMINS.includes(String(email || '').trim().toLowerCase());
}

// Adivina familia/producto a partir de la ruta relativa de un archivo (por
// ejemplo, la que da webkitRelativePath al elegir una carpeta entera) - es
// solo una sugerencia inicial para no dejar el campo en blanco: Felipe (o
// quien importe) la puede cambiar antes de guardar, nunca se guarda a
// ciegas. Basado en los mismos patrones ya vistos al inventariar Drive a
// mano (10/09/2026).
const FAMILY_PATH_RULES = [
  [/MAQUINAS\/|REPUESTOS-ACCESORIOS\//i, 'PURMAC'],
  [/AGLUPLAST/i, 'Otra'],
  [/DMF|ISOCIANATO/i, 'Poliuretano'],
  [/IMPERMEABILIZA|\bPA[ _-]?500\b/i, 'Imperpur'],
  [/IMPRIMANTE.*POLIUREA|POLIUREA/i, 'Poliurea'],
  [/RESINA/i, 'Resinplast'],
  [/SILICONA/i, 'Otra'],
  [/POLIURETANO/i, 'Poliuretano'],
  [/PENOSIL/i, 'Penosil'],
  [/CARROZADO/i, 'Carrozados'],
  [/BALDE/i, 'Baldes'],
  [/\bPISO/i, 'Pisos'],
  [/\bEPP\b/i, 'EPP'],
  [/ALMOHADA/i, 'Almohadas'],
  [/PRFV|FIBRA DE VIDRIO/i, 'PRFV'],
  [/FOAM FACTORY/i, 'Foam Factory'],
];

export function guessFamilyFromPath(path = '') {
  for (const [pattern, family] of FAMILY_PATH_RULES) {
    if (pattern.test(path)) return family;
  }
  return 'Otra';
}

// De "PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 619 SP/PDS isoBUNKER 619-SP.pdf"
// saca título (nombre de archivo sin extensión), producto (carpeta
// inmediata) y familia sugerida - todo editable después, nada definitivo.
export function parsePathHints(relativePath = '') {
  const clean = String(relativePath || '').replace(/^\.?\//, '');
  const parts = clean.split('/').filter(Boolean);
  const fileName = parts.at(-1) || clean;
  return {
    title: fileName.replace(/\.(pdf|docx?|xlsx?)$/i, ''),
    product: parts.length > 1 ? parts.at(-2) : '',
    family: guessFamilyFromPath(clean),
  };
}

// La carpeta de un documento no vive en una columna propia - se deriva de
// source_file, que ya guarda la ruta completa de Drive (ej.
// "PRODUCTOS/POLIURETANOS RIGIDOS/Ficha Técnica 619 SP/PDS isoBUNKER
// 619-SP.pdf" -> carpeta "PRODUCTOS / POLIURETANOS RIGIDOS / Ficha Técnica
// 619 SP"). Así la organización por carpetas queda igual que en Drive, sin
// agregar una columna ni una tabla nueva que se pueda desincronizar.
export function folderFromSourceFile(sourceFile = '') {
  const clean = String(sourceFile || '').replace(/^\.?\//, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length <= 1) return 'Sin carpeta';
  return parts.slice(0, -1).join(' / ');
}

// Árbol real de carpetas (no una lista plana con el camino completo como
// título) - cada tramo de folderFromSourceFile es un nivel propio, como en
// Drive o el explorador de archivos. Los documentos solo cuelgan de la
// carpeta hoja a la que pertenecen; las carpetas intermedias no tienen
// documentos propios, solo subcarpetas.
function sortedDocuments(documents) {
  return [...documents].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

export function buildFolderTree(documents = []) {
  const root = { name: null, path: '', children: new Map(), documents: [] };
  for (const doc of documents) {
    const folder = folderFromSourceFile(doc.sourceFile);
    if (folder === 'Sin carpeta') {
      root.documents.push(doc);
      continue;
    }
    const parts = folder.split(' / ');
    let node = root;
    const pathParts = [];
    for (const part of parts) {
      pathParts.push(part);
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: pathParts.join(' / '), children: new Map(), documents: [] });
      }
      node = node.children.get(part);
    }
    node.documents.push(doc);
  }
  return serializeFolderNode(root);
}

function countDocuments(node) {
  return node.documents.length + [...node.children.values()].reduce((sum, child) => sum + countDocuments(child), 0);
}

function serializeFolderNode(node) {
  return {
    name: node.name,
    path: node.path,
    documents: sortedDocuments(node.documents),
    count: countDocuments(node),
    children: [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(serializeFolderNode),
  };
}

export function groupDocumentsByFolder(documents = []) {
  const groups = new Map();
  for (const doc of documents) {
    const folder = folderFromSourceFile(doc.sourceFile);
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(doc);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, docs]) => ({ folder, documents: docs.sort((a, b) => (a.title || '').localeCompare(b.title || '')) }));
}

export function historyFromRow(row = {}) {
  return {
    id: row.id,
    documentId: row.document_id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    changedByEmail: row.changed_by_email,
    note: row.note,
    changedAt: row.changed_at,
  };
}
