// TEMPORAL - borrar despues de usar (incidente de datos del 27-28/09/2026:
// una query manual mia con "externalId not like ..." descarto por error las
// tareas sin externalId, es decir todas las tareas manuales reales, por la
// logica de NULL en SQL). Lee un backup de Storage; con action=restore
// reemplaza SOLO data.tasks del workspace por las del backup (sacando las de
// origin="Prueba técnica"). El resto de `data` no se toca. Autorizado por
// Felipe explicitamente antes de correr con action=restore.
function authorized(request) {
  const secret = process.env.TASKS_API_SECRET;
  if (!secret) return false;
  return (request.headers.authorization || '') === `Bearer ${secret}`;
}

async function readBackupTasks(date, workspaceKey) {
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/backups/${date}/workspace_states.json`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`Storage respondio ${r.status}`);
  const rows = await r.json();
  const row = rows.find((item) => item.workspace_key === workspaceKey);
  if (!row) throw new Error('workspace no encontrado en el backup');
  return (row.data.tasks || []).filter((t) => t.origin !== 'Prueba técnica');
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(401).json({ error: 'No autorizado.' });
  const { date, workspaceKey, action } = request.query;
  if (!date || !workspaceKey) return response.status(400).json({ error: 'Faltan date/workspaceKey.' });
  try {
    const tasks = await readBackupTasks(date, workspaceKey);
    if (action !== 'restore') return response.status(200).json({ taskCount: tasks.length });

    const currentRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.${encodeURIComponent(workspaceKey)}&select=data`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    if (!currentRes.ok) throw new Error(`Lectura actual fallo ${currentRes.status}`);
    const [currentRow] = await currentRes.json();
    if (!currentRow) throw new Error('workspace no existe hoy');
    const nextData = { ...currentRow.data, tasks };

    const writeRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.${encodeURIComponent(workspaceKey)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ data: nextData, updated_at: new Date().toISOString() }),
      },
    );
    if (!writeRes.ok) throw new Error(`Escritura fallo ${writeRes.status}`);
    return response.status(200).json({ ok: true, restoredTaskCount: tasks.length, otherFieldsKept: Object.keys(currentRow.data).filter((k) => k !== 'tasks') });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
