import { withRetry } from '../lib/retry.mjs';
import { logError } from '../lib/log.mjs';
import { applyTaskIntake, validateTaskIntakePayload } from '../lib/tasks-intake.mjs';

// Punto de entrada para automatizaciones externas (tareas programadas de
// Shopify/Mercado Libre en claude.ai, ver docs/SISTEMA_COMERCIAL_GRUPO_
// POLIPLAST.md) que necesitan dejar un hallazgo accionable en la misma
// bandeja de Tareas que usa Felipe todos los días - no en una tabla nueva
// que el CRM no lee. Escribe directo en workspace_states.data.tasks, mismo
// modelo que crea la UI (ver src/app-shared.jsx blankTask), con el mismo
// patrón de auth/retry que api/cron-daily-maintenance.js.
function authorized(request) {
  const secret = process.env.TASKS_API_SECRET;
  if (!secret) return false; // fail-safe: sin secret configurado, nunca acepta escrituras.
  const authorization = request.headers.authorization || '';
  return authorization === `Bearer ${secret}`;
}

async function fetchWorkspaceRow(environment, workspaceKey, fetchImpl = fetch) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(
        `${environment.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.${encodeURIComponent(workspaceKey)}&select=data`,
        { headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` } },
      );
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, rows: await response.json() };
  });
  if (!result.ok) throw new Error(`No se pudo leer el workspace (status ${result.status ?? 'sin respuesta'}).`);
  return result.rows[0]?.data || null;
}

async function saveWorkspaceRow(environment, workspaceKey, data, fetchImpl = fetch) {
  const result = await withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(`${environment.SUPABASE_URL}/rest/v1/workspace_states?workspace_key=eq.${encodeURIComponent(workspaceKey)}`, {
        method: 'PATCH',
        headers: {
          apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
    } catch (error) {
      return { ok: false, threw: true, error };
    }
    return { ok: response.ok, status: response.status };
  });
  if (!result.ok) throw new Error(`No se pudo guardar el workspace (status ${result.status ?? 'sin respuesta'}).`);
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
    const data = await fetchWorkspaceRow(process.env, workspaceKey);
    if (!data) return response.status(404).json({ error: `No existe el workspace ${workspaceKey}.` });
    const { changed, task, wasNew, nextState } = applyTaskIntake(data, payload, nowISO);
    if (changed) await saveWorkspaceRow(process.env, workspaceKey, nextState);
    return response.status(200).json({ ok: true, wasNew, task: { id: task.id, externalId: task.externalId, title: task.title } });
  } catch (error) {
    logError('tasks-intake', 'failed to apply task intake', { workspaceKey, ranAt: nowISO }, error);
    return response.status(500).json({ error: 'Error interno al registrar la tarea.' });
  }
}
