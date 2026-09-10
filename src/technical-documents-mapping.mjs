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
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
