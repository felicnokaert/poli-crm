import { buildFullDailyMaintenanceUpdate } from '../src/daily-maintenance.mjs';
import { withRetry } from '../lib/retry.mjs';

// Cron interno de mantenimiento (ver docs/AUDITORIA_MADUREZ_PRODUCTO_2026-09-12.md,
// Automatización 35/100: "cero cron jobs... todo lo inteligente es manual o
// requiere que alguien tenga la pestaña abierta"). Por decisión de Felipe,
// alcance acotado a pisa propia: solo mantenimiento de datos server-side,
// nunca manda mensajes/emails a nadie afuera.
//
// Hoy el cierre de tareas vencidas (completeTasksThrough) y las 3 señales de
// negocio (leads calientes sin respuesta, cotizaciones frías, radar de
// recompra) solo corren client-side cuando alguien abre el CRM (src/App.jsx,
// src/Dashboard.jsx). Si nadie abre la app por varios días, ni las tareas
// vencidas se cierran ni las señales se calculan/guardan en ningún lado.
// Este cron aplica la misma lógica pura (buildFullDailyMaintenanceUpdate) a
// cada fila de workspace_states, server-side, todos los días, y persiste el
// resultado de las señales en `data.dailySignals`.
function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-safe: sin secret configurado, nunca corre.
  const authorization = request.headers.authorization || '';
  return authorization === `Bearer ${secret}`;
}

async function fetchWorkspaceRows(environment) {
  const result = await fetch(`${environment.SUPABASE_URL}/rest/v1/workspace_states?select=workspace_key,data`, {
    headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!result.ok) throw new Error(`No se pudieron leer los workspaces (status ${result.status}).`);
  return result.json();
}

// El PATCH puede fallar por un corte de red o un 5xx pasajero de Supabase -
// eso no debería tirar todo el cron ni perder el cálculo de mantenimiento de
// ese workspace. Reintenta un par de veces con backoff acotado, pero nunca
// para errores de credenciales/validación (401/403/4xx en general): esos
// van a fallar exactamente igual en el siguiente intento.
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
      // fetch rechazado (timeout, DNS, conexión cortada): sin status HTTP.
      return { ok: false, threw: true, error };
    }
    return { ok: response.ok, status: response.status };
  });
  if (!result.ok) {
    throw new Error(`No se pudo actualizar el workspace ${workspaceKey} (status ${result.status ?? 'sin respuesta'}).`);
  }
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(401).json({ error: 'No autorizado.' });
  const nowISO = new Date().toISOString();
  // Se guarda afuera del try para que, si algo falla a mitad de camino, el
  // log diga en qué paso y en qué workspace estaba (en vez de un error crudo
  // sin ubicar - lo que hace falta para diagnosticar desde los logs de
  // Vercel sin tener que reproducir el fallo).
  let step = 'fetchWorkspaceRows';
  let currentWorkspaceKey = null;
  try {
    const rows = await fetchWorkspaceRows(process.env);
    const results = [];
    step = 'buildFullDailyMaintenanceUpdate';
    for (const row of rows) {
      currentWorkspaceKey = row.workspace_key;
      const { changed, nextState, summary } = buildFullDailyMaintenanceUpdate(row.data || {}, nowISO);
      if (changed) {
        step = 'saveWorkspaceRow';
        await saveWorkspaceRow(process.env, row.workspace_key, nextState);
      }
      results.push({ workspaceKey: row.workspace_key, changed, ...summary });
    }
    return response.status(200).json({
      ok: true,
      ranAt: nowISO,
      workspacesProcessed: results.length,
      workspacesUpdated: results.filter((item) => item.changed).length,
      tasksClosed: results.reduce((sum, item) => sum + (item.tasksClosed || 0), 0),
      results,
    });
  } catch (error) {
    console.error(`cron-daily-maintenance failed at step "${step}"${currentWorkspaceKey ? ` (workspaceKey=${currentWorkspaceKey})` : ''} ranAt=${nowISO}:`, error);
    return response.status(500).json({ error: 'Error interno al correr el mantenimiento diario.' });
  }
}
