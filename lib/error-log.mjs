// Registro de errores de la app en producción (16/10). Cuando a alguien le falla una pantalla, el
// navegador manda el detalle acá y queda guardado como un archivo en el espacio privado "backups" de
// Supabase (errors/AAAA-MM-DD/...). Felipe los ve en Datos. Sin tabla nueva: no hace falta tocar la base.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';
import { isAdminEmail } from './admin-users.mjs';

const BUCKET = 'backups';
const cut = (value, max) => String(value ?? '').slice(0, max);

export function errorRecord(body = {}, user = {}, now = new Date()) {
  return {
    at: now.toISOString(),
    email: cut(user.email, 120),
    view: cut(body.view, 60),
    message: cut(body.message, 500),
    stack: cut(body.stack, 2000),
    url: cut(body.url, 300),
    userAgent: cut(body.userAgent, 200),
  };
}

export async function logClientError(request, environment = process.env, http = fetch, now = new Date()) {
  const user = await authenticatedCorporateUser(request, environment, http);
  if (!user?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const record = errorRecord(request.body || {}, user, now);
  if (!record.message) return { status: 400, body: { error: 'Falta el mensaje.' } };
  const path = `errors/${record.at.slice(0, 10)}/${record.at.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.json`;
  const response = await http(`${environment.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(record),
  });
  return response.ok ? { status: 200, body: { ok: true } } : { status: 502, body: { error: 'No se pudo guardar el error.' } };
}

// Los errores de los últimos días, más nuevos primero (solo Felipe).
export async function listClientErrors(request, environment = process.env, http = fetch, now = new Date(), days = 7, limit = 60) {
  const user = await authenticatedCorporateUser(request, environment, http);
  if (!user?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(user.email)) return { status: 403, body: { error: 'Solo Felipe ve los errores.' } };
  const files = [];
  for (let back = 0; back < days && files.length < limit; back += 1) {
    const day = new Date(now.getTime() - back * 86400000).toISOString().slice(0, 10);
    const response = await http(`${environment.SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: `errors/${day}/`, limit: 100, sortBy: { column: 'name', order: 'desc' } }),
    });
    if (!response.ok) continue;
    for (const item of await response.json()) if (item?.name?.endsWith('.json')) files.push(`errors/${day}/${item.name}`);
  }
  const records = [];
  for (const path of files.slice(0, limit)) {
    const response = await http(`${environment.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: serviceHeaders(environment) });
    if (response.ok) records.push(await response.json().catch(() => null));
  }
  return { status: 200, body: { errors: records.filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at))) } };
}
