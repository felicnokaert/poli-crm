const MAX_IDS = 500;

async function authenticatedUser(request, environment = process.env, http = fetch) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return null;
  const result = await http(`${environment.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: environment.SUPABASE_SERVICE_ROLE_KEY } });
  return result.ok ? result.json() : null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedUser(request);
  if (!user?.id) return response.status(401).json({ error: 'Sesión no autorizada.' });
  const ids = [...new Set((Array.isArray(request.body?.eventIds) ? request.body.eventIds : []).map(String).filter(Boolean))].slice(0, MAX_IDS);
  if (!ids.length) return response.status(400).json({ error: 'No hay eventos para eliminar.' });
  const query = ids.map((id) => `"${encodeURIComponent(id)}"`).join(',');
  const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/whatsapp_events?event_id=in.(${query})`, {
    method: 'DELETE',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'return=minimal' },
  });
  if (!result.ok) return response.status(502).json({ error: 'No se pudieron eliminar los eventos.' });
  return response.status(200).json({ ok: true, deleted: ids.length });
}
