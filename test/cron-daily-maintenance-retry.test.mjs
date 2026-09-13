import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/cron-daily-maintenance.js';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

// El cron llama a saveWorkspaceRow (api/cron-daily-maintenance.js), que hace
// un PATCH crudo contra Supabase con fetch global. Esta prueba confirma que
// un 503 transitorio en ese PATCH se reintenta (y no tira todo el cron
// abajo), pero sin pasarse de la cantidad de reintentos configurada.
test('cron retries a transient 503 on the workspace PATCH and still reports success', async (t) => {
  const previousSecret = process.env.CRON_SECRET;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  const originalFetch = global.fetch;
  let patchAttempts = 0;
  global.fetch = t.mock.fn(async (url, options) => {
    const method = options?.method || 'GET';
    if (method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          workspace_key: 'user-1',
          data: { tasks: [{ id: 'overdue', dueDate: '2000-01-01', done: false }] },
        }],
      };
    }
    // PATCH del workspace: falla la primera vez con un 503 transitorio,
    // funciona en el segundo intento.
    patchAttempts += 1;
    if (patchAttempts === 1) return { ok: false, status: 503 };
    return { ok: true, status: 204 };
  });

  try {
    const response = responseRecorder();
    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.workspacesUpdated, 1);
    // 1 intento fallido (503) + 1 reintento exitoso = 2 llamadas al PATCH,
    // nunca más que eso.
    assert.equal(patchAttempts, 2);
  } finally {
    global.fetch = originalFetch;
    process.env.CRON_SECRET = previousSecret;
    process.env.SUPABASE_URL = previousUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

// Un 401 (credenciales inválidas) nunca debería reintentarse: fallaría
// exactamente igual todas las veces, así que saveWorkspaceRow debe fallar
// rápido en vez de demorar con reintentos inútiles. Con una sola fila en
// juego, esa fila queda marcada como fallida en el resultado (ok:false a
// nivel cron), pero el endpoint en sí responde 200 - la lectura de
// workspaces funcionó, sólo falló la escritura de esta fila puntual.
test('cron does not retry a 401 on the workspace PATCH, fails fast and reports the row as failed', async (t) => {
  const previousSecret = process.env.CRON_SECRET;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  const originalFetch = global.fetch;
  let patchAttempts = 0;
  global.fetch = t.mock.fn(async (url, options) => {
    const method = options?.method || 'GET';
    if (method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          workspace_key: 'user-1',
          data: { tasks: [{ id: 'overdue', dueDate: '2000-01-01', done: false }] },
        }],
      };
    }
    patchAttempts += 1;
    return { ok: false, status: 401 };
  });

  try {
    const response = responseRecorder();
    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, false);
    assert.equal(response.payload.workspacesFailed, 1);
    assert.equal(response.payload.results[0].ok, false);
    assert.match(response.payload.results[0].error, /user-1/);
    assert.equal(patchAttempts, 1);
  } finally {
    global.fetch = originalFetch;
    process.env.CRON_SECRET = previousSecret;
    process.env.SUPABASE_URL = previousUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

// El caso que justifica procesar cada fila por separado: si Supabase se
// comporta de forma inconsistente entre filas (una cuenta con credenciales
// vencidas, las demás sanas), el workspace roto no debe impedir que las
// demás tareas vencidas/señales/auto-tareas de OTROS workspaces se procesen
// y persistan igual. Antes de este cambio, el try/catch único de todo el
// handler abortaba la corrida completa (500) apenas fallaba una fila.
test('a broken row does not stop the cron from processing the other workspaces', async (t) => {
  const previousSecret = process.env.CRON_SECRET;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  const originalFetch = global.fetch;
  const patchedWorkspaces = [];
  global.fetch = t.mock.fn(async (url, options) => {
    const method = options?.method || 'GET';
    if (method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { workspace_key: 'broken-workspace', data: { tasks: [{ id: 't1', dueDate: '2000-01-01', done: false }] } },
          { workspace_key: 'healthy-workspace-a', data: { tasks: [{ id: 't2', dueDate: '2000-01-01', done: false }] } },
          { workspace_key: 'healthy-workspace-b', data: { tasks: [{ id: 't3', dueDate: '2000-01-01', done: false }] } },
        ],
      };
    }
    // PATCH: la fila "broken-workspace" siempre devuelve 401 (no
    // reintentable); las otras dos filas guardan bien.
    if (String(url).includes('broken-workspace')) return { ok: false, status: 401 };
    patchedWorkspaces.push(String(url));
    return { ok: true, status: 204 };
  });

  try {
    const response = responseRecorder();
    await handler({ headers: { authorization: 'Bearer test-cron-secret' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.workspacesProcessed, 3);
    assert.equal(response.payload.workspacesFailed, 1);
    assert.equal(response.payload.workspacesUpdated, 2);
    assert.equal(response.payload.ok, false);

    const broken = response.payload.results.find((item) => item.workspaceKey === 'broken-workspace');
    assert.equal(broken.ok, false);
    const healthyA = response.payload.results.find((item) => item.workspaceKey === 'healthy-workspace-a');
    const healthyB = response.payload.results.find((item) => item.workspaceKey === 'healthy-workspace-b');
    assert.equal(healthyA.ok, true);
    assert.equal(healthyA.changed, true);
    assert.equal(healthyB.ok, true);
    assert.equal(healthyB.changed, true);
    // Las dos filas sanas efectivamente llegaron a hacer PATCH pese a que la
    // primera de las tres filas falló.
    assert.equal(patchedWorkspaces.length, 2);
  } finally {
    global.fetch = originalFetch;
    process.env.CRON_SECRET = previousSecret;
    process.env.SUPABASE_URL = previousUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
