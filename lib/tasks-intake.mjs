// Ver docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md - las tareas programadas de
// Shopify/Mercado Libre (claude.ai) necesitaban un lugar único donde dejar
// hallazgos accionables sin duplicar en cada corrida. Este modulo es la
// logica pura (testeable sin red) que aplica un hallazgo externo sobre el
// estado de un workspace, reusando el mismo modelo de tarea que ya crea
// App.jsx (ver blankTask en src/app-shared.jsx): title/company/trigger/
// cadence/priority/dueDate/done. `externalId` es el campo nuevo que permite
// el upsert - si ya existe una tarea con ese id, no se crea otra.

export function validateTaskIntakePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['El cuerpo debe ser un objeto JSON.'];
  if (!payload.externalId || typeof payload.externalId !== 'string') errors.push('externalId es obligatorio (string estable, ej. "shopify-seo-null-RE-608-1.5").');
  if (!payload.origin || typeof payload.origin !== 'string') errors.push('origin es obligatorio (ej. "Automatización Shopify").');
  if (!payload.title || typeof payload.title !== 'string') errors.push('title es obligatorio.');
  if (payload.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) errors.push('dueDate debe tener formato YYYY-MM-DD si se envía.');
  if (payload.priority && !['Alta', 'Media', 'Baja'].includes(payload.priority)) errors.push('priority debe ser "Alta", "Media" o "Baja" si se envía.');
  return errors;
}

export function buildIntakeTask(payload, nowISO, randomId = () => globalThis.crypto.randomUUID()) {
  return {
    id: randomId(),
    externalId: payload.externalId,
    origin: payload.origin,
    company: payload.origin,
    title: payload.title,
    trigger: payload.description || '',
    category: payload.category || '',
    cadence: payload.category || 'Automatización externa',
    priority: payload.priority || 'Media',
    dueDate: payload.dueDate || '',
    clientId: '',
    done: false,
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

// Version en memoria (testeable sin red). El endpoint real ya NO la usa para
// guardar: hace el alta atomica con la funcion SQL append_workspace_task, que
// evita perder tareas cuando entran varios POST a la vez.
export function applyTaskIntake(data, payload, nowISO, randomId = () => globalThis.crypto.randomUUID()) {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const existing = tasks.find((task) => task.externalId === payload.externalId);
  if (existing) {
    return { changed: false, task: existing, wasNew: false, nextState: data };
  }
  const task = buildIntakeTask(payload, nowISO, randomId);
  return { changed: true, task, wasNew: true, nextState: { ...data, tasks: [...tasks, task] } };
}

// Alta atomica en Supabase via RPC. Devuelve { wasNew, task }.
export async function insertIntakeTaskAtomically(environment, workspaceKey, task, fetchImpl = fetch) {
  const response = await fetchImpl(`${environment.SUPABASE_URL}/rest/v1/rpc/append_workspace_task`, {
    method: 'POST',
    headers: {
      apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_workspace_key: workspaceKey, p_task: task }),
  });
  if (!response.ok) throw new Error(`append_workspace_task fallo (status ${response.status}).`);
  const inserted = await response.json();
  return { wasNew: inserted === true, task };
}
