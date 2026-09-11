// Puente entre la vista previa de importación (technical-inventory-import.mjs)
// y la tabla compartida de Supabase (docs/MIGRACION_BASE_TECNICA.sql). Usa el
// mismo cliente autenticado que el resto del CRM - la seguridad la hace RLS,
// no este archivo: cualquier intento de guardar algo "vigente" sin validar,
// o de borrar un documento, es rechazado por la base, no solo por la UI.
import { supabase } from './online.js';
import { extractPdfText } from './pdf-text.js';
import { fromRow, historyFromRow, toRow } from './technical-documents-mapping.mjs';

const STORAGE_BUCKET = 'technical-documents';

// Catálogo completo, compartido a nivel Grupo Poliplast (no filtra por
// canal - General/Penosil/Juan ven lo mismo, ver ADR-001).
export async function fetchTechnicalDocuments() {
  const { data, error } = await supabase
    .from('technical_documents')
    .select('*')
    .order('family', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Guarda solo los candidatos "nuevos" de la vista previa (classifyInventoryImport).
// Nunca se llama con "modificados"/"duplicados" - esos quedan para que una
// persona decida a mano, la vista previa nunca se auto-confirma.
//
// filesBySourceFile (opcional): el File real de cada candidato, keyed por su
// sourceFile - si viene, el PDF queda adjunto en Storage y su texto
// extraído automáticamente, todo en el mismo paso de importar (Felipe:
// "quiero... tenerla adjunta en pdf... a raíz de ello va aprendiendo"). Si
// un archivo puntual falla al subirse, el documento igual queda guardado -
// se puede adjuntar después a mano desde Base técnica, no bloquea el resto.
export async function saveInventoryImport(newDocuments = [], filesBySourceFile = {}) {
  if (!newDocuments.length) return [];
  const rows = newDocuments.map(toRow);
  const { data, error } = await supabase.from('technical_documents').insert(rows).select();
  if (error) throw error;
  const saved = (data || []).map(fromRow);
  return Promise.all(saved.map(async (doc) => {
    const file = filesBySourceFile[doc.sourceFile];
    if (!file) return doc;
    try {
      return await attachTechnicalDocumentFile(doc.id, file);
    } catch {
      return doc;
    }
  }));
}

// Cambiar de estado (incluye marcar "vigente", solo permitido por RLS a
// is_poliplast_crm_admin con verified_by/verified_at presentes). notes queda
// como la observación de ese cambio puntual - log_technical_document_status_change
// la copia al historial automáticamente.
export async function updateTechnicalDocumentStatus(id, { status, notes = '', verifiedByUserId = null, verifiedByEmail = null, verifiedAt = null, replacedBy = undefined } = {}) {
  const patch = { status, notes };
  if (status === 'vigente') {
    patch.verified_by = verifiedByUserId;
    patch.verified_by_email = verifiedByEmail;
    patch.verified_at = verifiedAt || new Date().toISOString();
  }
  // replacedBy solo se toca si vino explícito - así un cambio de estado que
  // no habla de reemplazo no borra un vínculo ya guardado.
  if (replacedBy !== undefined) patch.replaced_by = replacedBy || null;
  const { data, error } = await supabase.from('technical_documents').update(patch).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// Renombrar un documento (el "nombre de la carpeta"/ficha que ve el equipo,
// no el archivo real en Drive - source_file no se toca). No dispara
// historial de validación: no es un cambio de estado, es prolijidad.
export async function updateTechnicalDocumentTitle(id, title) {
  const clean = String(title || '').trim();
  if (!clean) throw new Error('El nombre no puede quedar vacío.');
  const { data, error } = await supabase.from('technical_documents').update({ title: clean }).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// Sube el PDF real al bucket privado technical-documents y extrae su texto
// en el mismo paso - la ficha queda adjunta de verdad (no solo su nombre) y
// el copiloto puede citar una línea literal de ella una vez vigente y
// validada (technical-document-governance.mjs citableExcerpt). No cambia el
// estado ni dispara historial de validación - es contenido, no una decisión
// de gobernanza. Se usa tanto al importar como para adjuntar/reemplazar el
// PDF de una ficha que ya existía sin archivo.
export async function attachTechnicalDocumentFile(id, file) {
  if (!/\.pdf$/i.test(file.name)) throw new Error(`"${file.name}" no es un PDF - el bucket solo acepta PDF.`);
  const path = `${id}/${Date.now()}-${file.name}`;
  // Forzamos 'application/pdf' siempre, sin mirar file.type: eligiendo una
  // carpeta entera (vs. un archivo suelto) algunos navegadores/SO reportan
  // un MIME genérico (ej. application/octet-stream) en vez de application/pdf
  // - el bucket lo rechaza (allowed_mime_types) y la ficha queda "sin
  // adjuntar" en silencio, sin ningún aviso claro de por qué.
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (uploadError) throw uploadError;
  let extractedText = null;
  try {
    extractedText = await extractPdfText(file);
  } catch {
    extractedText = null;
  }
  const { data, error } = await supabase
    .from('technical_documents')
    .update({ storage_path: path, extracted_text: extractedText })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// URL firmada y temporal para ver/descargar el PDF adjunto - el bucket es
// privado (solo equipo Poliplast, misma regla que el resto del CRM), no se
// puede armar una URL pública fija.
export async function getTechnicalDocumentFileUrl(storagePath) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data?.signedUrl || null;
}

// Solo Felipe puede borrar (RLS: "Admin elimina documentos tecnicos") - es
// una ficha de referencia técnica compartida por todo el equipo, no algo
// que cualquiera pueda hacer desaparecer sin querer. Si tenía un PDF
// adjunto, se intenta borrar también del bucket - "mejor esfuerzo": si el
// archivo ya no estaba (o falla el borrado en Storage), la fila igual se
// borra, no queda una ficha fantasma bloqueando el intento.
export async function deleteTechnicalDocument(id, storagePath) {
  if (storagePath) {
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // best-effort, ver comentario de arriba
    }
  }
  const { error } = await supabase.from('technical_documents').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTechnicalDocumentHistory(documentId) {
  const { data, error } = await supabase
    .from('technical_document_history')
    .select('*')
    .eq('document_id', documentId)
    .order('changed_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(historyFromRow);
}
