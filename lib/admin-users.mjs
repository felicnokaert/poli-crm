// Borrado de usuarios por el administrador (Felipe). La lista sale de la función SQL admin_list_users();
// el borrado necesita la clave de servicio, por eso pasa por el servidor y no por el navegador.
import { authenticatedCorporateUser, serviceHeaders } from './corporate-auth.mjs';

export const ADMIN_EMAILS = ['felipe@grupopoliplast.com.ar', 'felipecnokaert@gmail.com'];
export const isAdminEmail = (email = '') => ADMIN_EMAILS.includes(String(email).trim().toLowerCase());

export async function deleteUser(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdminEmail(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede borrar usuarios.' } };
  const userId = String(request.body?.userId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { status: 400, body: { error: 'Usuario inválido.' } };
  if (userId === caller.id) return { status: 400, body: { error: 'No podés borrar tu propia cuenta.' } };

  const target = await http(`${environment.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: serviceHeaders(environment) });
  if (!target.ok) return { status: 404, body: { error: 'No encontré ese usuario.' } };
  const user = await target.json();
  if (isAdminEmail(user.email)) return { status: 400, body: { error: 'No se puede borrar a un administrador.' } };

  const removed = await http(`${environment.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: serviceHeaders(environment) });
  if (!removed.ok) return { status: 502, body: { error: 'No se pudo borrar el usuario.' } };
  // Su descripción personal sale con él; su espacio de trabajo (workspace_states) queda guardado.
  await http(`${environment.SUPABASE_URL}/rest/v1/team_self_profiles?email=eq.${encodeURIComponent(String(user.email || '').toLowerCase())}`, { method: 'DELETE', headers: serviceHeaders(environment, { Prefer: 'return=minimal' }) });
  return { status: 200, body: { ok: true, email: user.email } };
}
