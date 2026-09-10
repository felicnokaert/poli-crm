// Puente entre la vista previa de importación (technical-inventory-import.mjs)
// y la tabla compartida de Supabase (docs/MIGRACION_BASE_TECNICA.sql). Usa el
// mismo cliente autenticado que el resto del CRM - la seguridad la hace RLS,
// no este archivo: cualquier intento de guardar algo "vigente" sin validar,
// o de borrar un documento, es rechazado por la base, no solo por la UI.
import { supabase } from './online.js';
import { fromRow, historyFromRow, toRow } from './technical-documents-mapping.mjs';

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
export async function saveInventoryImport(newDocuments = []) {
  if (!newDocuments.length) return [];
  const rows = newDocuments.map(toRow);
  const { data, error } = await supabase.from('technical_documents').insert(rows).select();
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Cambiar de estado (incluye marcar "vigente", solo permitido por RLS a
// is_poliplast_crm_admin con verified_by/verified_at presentes). notes queda
// como la observación de ese cambio puntual - log_technical_document_status_change
// la copia al historial automáticamente.
export async function updateTechnicalDocumentStatus(id, { status, notes = '', verifiedByUserId = null, verifiedByEmail = null, verifiedAt = null } = {}) {
  const patch = { status, notes };
  if (status === 'vigente') {
    patch.verified_by = verifiedByUserId;
    patch.verified_by_email = verifiedByEmail;
    patch.verified_at = verifiedAt || new Date().toISOString();
  }
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

export async function fetchTechnicalDocumentHistory(documentId) {
  const { data, error } = await supabase
    .from('technical_document_history')
    .select('*')
    .eq('document_id', documentId)
    .order('changed_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(historyFromRow);
}
