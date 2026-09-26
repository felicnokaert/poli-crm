import { withRetry } from '../lib/retry.mjs';
import { logError } from '../lib/log.mjs';
import { buildIntakeTask, insertIntakeTaskAtomically, validateTaskIntakePayload } from '../lib/tasks-intake.mjs';

// Punto de entrada para automatizaciones externas (tareas programadas de
// Shopify/Mercado Libre en claude.ai, ver docs/SISTEMA_COMERCIAL_GRUPO_
// POLIPLAST.md) que necesitan dejar un hallazgo accionable en la misma
// bandeja de Tareas que usa Felipe todos los días. Escribe en
// workspace_states.data.tasks con el mismo modelo que crea la UI (ver
// src/app-shared.jsx blankTask) y el mismo patrón de auth que
// api/cron-daily-maintenance.js.
//
// El alta es ATOMICA (funcion SQL append_workspace_task): antes leiamos todo
// el jsonb, agregabamos la tarea en JS y lo reescribiamos, asi que varios POST
// simultaneos se pisaban entre si y perdian tareas.
function authorized(request) {
  const secret = process.env.TASKS_API_SECRET;
  if (!secret) return false; // fail-safe: sin secret configurado, nunca acepta escrituras.
  const authorization = request.headers.authorization || '';
  return authorization === `Bearer ${secret}`;
}

async function workspaceExists(environment, workspaceKey, fetchImpl = fetch) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(
        `${environment.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.${encodeURIComponent(workspaceKey)}&select=workspace_key`,
        { headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` } },
      );
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, rows: await response.json() };
  });
  if (!result.ok) throw new Error(`No se pudo leer el workspace (status ${result.status ?? 'sin respuesta'}).`);
  return result.rows.length > 0;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido, usar POST.' });
  if (!authorized(request)) return response.status(401).json({ error: 'No autorizado.' });

  const workspaceKey = process.env.TASKS_INTAKE_WORKSPACE_KEY;
  if (!workspaceKey) return response.status(500).json({ error: 'Falta configurar TASKS_INTAKE_WORKSPACE_KEY.' });

  const payload = request.body || {};
  const errors = validateTaskIntakePayload(payload);
  if (errors.length) return response.status(400).json({ error: 'Payload inválido.', details: errors });

  const nowISO = new Date().toISOString();
  try {
    const task = buildIntakeTask(payload, nowISO);
    const inserted = await withRetry(async () => {
      try {
        return { ok: true, ...(await insertIntakeTaskAtomically(process.env, workspaceKey, task)) };
      } catch (error) {
        return { ok: false, threw: true, error };
      }
    });
    if (!inserted.ok) throw new Error('append_workspace_task no respondio ok.');
    const { wasNew } = inserted;
    if (!wasNew && !(await workspaceExists(process.env, workspaceKey))) {
      return response.status(404).json({ error: `No existe el workspace ${workspaceKey}.` });
    }
    // Si ya existia (wasNew:false) no devolvemos el id: el generado arriba
    // no se uso y el de la tarea guardada no se consulta (evita leer 3MB).
    return response.status(200).json({
      ok: true,
      wasNew,
      task: wasNew ? { id: task.id, externalId: task.externalId, title: task.title } : { externalId: task.externalId },
    });
  } catch (error) {
    logError('tasks-intake', 'failed to apply task intake', { workspaceKey, ranAt: nowISO }, error);
    return response.status(500).json({ error: 'Error interno al registrar la tarea.' });
  }
}
