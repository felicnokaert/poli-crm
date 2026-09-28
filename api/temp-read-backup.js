// TEMPORAL - borrar despues de usar (incidente de datos del 27-28/09/2026,
// ver docs). Solo lee un backup de Storage y devuelve el array `tasks` de un
// workspace puntual. No escribe nada.
function authorized(request) {
  const secret = process.env.TASKS_API_SECRET;
  if (!secret) return false;
  return (request.headers.authorization || '') === `Bearer ${secret}`;
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(401).json({ error: 'No autorizado.' });
  const { date, workspaceKey } = request.query;
  if (!date || !workspaceKey) return response.status(400).json({ error: 'Faltan date/workspaceKey.' });
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/backups/${date}/workspace_states.json`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) return response.status(r.status).json({ error: `Storage respondio ${r.status}` });
  const rows = await r.json();
  const row = rows.find((item) => item.workspace_key === workspaceKey);
  if (!row) return response.status(404).json({ error: 'workspace no encontrado en el backup' });
  return response.status(200).json({ taskCount: (row.data.tasks || []).length, tasks: row.data.tasks || [] });
}
