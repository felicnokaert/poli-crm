// Tareas de Base técnica que necesitan la clave de servicio (solo Felipe):
//  - borrar documentos en tanda (archivos + filas), devolviendo el motivo real si algo falla;
//  - que el espacio de archivos acepte Word, Excel, PowerPoint, texto y fotos, no solo PDF.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';

const BUCKET = 'technical-documents';
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
];
const UUID = /^[0-9a-f-]{36}$/i;

async function errorText(response) {
  const body = await response.json().catch(() => null);
  return body?.message || body?.error || body?.hint || `HTTP ${response.status}`;
}

export async function technicalAdmin(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede hacer esto.' } };
  const base = environment.SUPABASE_URL;
  const mode = request.body?.mode;

  if (mode === 'allowTypes') {
    const response = await http(`${base}/storage/v1/bucket/${BUCKET}`, {
      method: 'PUT',
      headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ public: false, allowed_mime_types: DOCUMENT_MIME_TYPES }),
    });
    if (!response.ok) return { status: 502, body: { error: `No se pudo cambiar: ${await errorText(response)}` } };
    return { status: 200, body: { ok: true } };
  }

  if (mode === 'delete') {
    const ids = [...new Set((request.body?.ids || []).map(String))].filter((id) => UUID.test(id)).slice(0, 1000);
    let deleted = 0;
    const errors = [];
    for (let index = 0; index < ids.length; index += 50) {
      const chunk = ids.slice(index, index + 50);
      const list = `in.(${chunk.join(',')})`;
      const rowsResponse = await http(`${base}/rest/v1/technical_documents?select=id,storage_path&id=${list}`, { headers: serviceHeaders(environment) });
      const rows = rowsResponse.ok ? await rowsResponse.json() : [];
      const paths = rows.map((row) => row.storage_path).filter(Boolean);
      if (paths.length) {
        // Mejor esfuerzo: si un archivo ya no estaba, igual se borra la ficha.
        await http(`${base}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }) }).catch(() => null);
      }
      const response = await http(`${base}/rest/v1/technical_documents?id=${list}`, { method: 'DELETE', headers: serviceHeaders(environment, { Prefer: 'return=representation' }) });
      if (!response.ok) { errors.push(await errorText(response)); continue; }
      deleted += (await response.json().catch(() => [])).length;
    }
    return { status: 200, body: { ok: errors.length === 0, deleted, requested: ids.length, errors: [...new Set(errors)].slice(0, 3) } };
  }
  return { status: 400, body: { error: 'Acción inválida.' } };
}
