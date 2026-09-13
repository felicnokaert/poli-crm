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

  // fetchWorkspaceRows es la única parte que, si falla, realmente no deja
  // nada para procesar (no hay filas) - eso sí amerita abortar con 500.
  let rows;
  try {
    rows = await fetchWorkspaceRows(process.env);
  } catch (error) {
    console.error(`cron-daily-maintenance failed at step "fetchWorkspaceRows" ranAt=${nowISO}:`, error);
    return response.status(500).json({ error: 'Error interno al correr el mantenimiento diario.' });
  }

  // A partir de acá cada fila se procesa de forma independiente: este cron
  // corre sin supervisión humana, así que un workspace con datos corruptos o
  // un PATCH que agota los reintentos de saveWorkspaceRow no debe impedir
  // que el resto de los workspaces (y sus tareas vencidas/señales/auto-tareas)
  // se procesen igual. El error de la fila que falló queda logueado con su
  // workspaceKey y reflejado en el resultado de esa fila (ok:false), no tira
  // abajo la corrida completa.
  const results = [];
  for (const row of rows) {
    const workspaceKey = row.workspace_key;
    try {
      const { changed, nextState, summary } = buildFullDailyMaintenanceUpdate(row.data || {}, nowISO);
      if (changed) {
        await saveWorkspaceRow(process.env, workspaceKey, nextState);
      }
      results.push({ workspaceKey, changed, ok: true, ...summary });
    } catch (error) {
      console.error(`cron-daily-maintenance failed processing workspaceKey=${workspaceKey} ranAt=${nowISO}:`, error);
      results.push({ workspaceKey, changed: false, ok: false, error: error.message || 'Error desconocido.' });
    }
  }

  const failed = results.filter((item) => !item.ok);
  return response.status(200).json({
    ok: failed.length === 0,
    ranAt: nowISO,
    workspacesProcessed: results.length,
    workspacesUpdated: results.filter((item) => item.changed).length,
    workspacesFailed: failed.length,
    tasksClosed: results.reduce((sum, item) => sum + (item.tasksClosed || 0), 0),
    results,
  });
}
