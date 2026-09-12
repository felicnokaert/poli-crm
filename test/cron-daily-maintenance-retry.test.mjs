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
// exactamente igual todas las veces, así que el cron debe fallar rápido en
// vez de demorar la respuesta con reintentos inútiles.
test('cron does not retry a 401 on the workspace PATCH and fails fast', async (t) => {
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
    assert.equal(response.statusCode, 500);
    assert.equal(patchAttempts, 1);
  } finally {
    global.fetch = originalFetch;
    process.env.CRON_SECRET = previousSecret;
    process.env.SUPABASE_URL = previousUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
