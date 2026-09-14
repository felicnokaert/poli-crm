import assert from 'node:assert/strict';
import test from 'node:test';
import { runDailyBackup, cleanupOldBackups } from '../lib/backup.mjs';

const ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key' };

function fakeFetchImpl(handlers) {
  return async (url, options) => {
    for (const [pattern, handler] of handlers) {
      if (pattern.test(String(url))) return handler(String(url), options);
    }
    throw new Error(`fetch inesperado en el test: ${url}`);
  };
}

test('runDailyBackup sube workspace_states y cada tabla propia del CRM a backups/<fecha>/<tabla>.json', async () => {
  const uploaded = [];
  const fetchImpl = fakeFetchImpl([
    [/\/storage\/v1\/object\/backups\//, (url, options) => {
      uploaded.push({ path: url.split('/backups/')[1], body: JSON.parse(options.body) });
      return { ok: true, status: 200 };
    }],
    [/\/rest\/v1\//, (url) => {
      const table = url.split('/rest/v1/')[1].split('?')[0];
      return { ok: true, status: 200, json: async () => [{ id: `${table}-row` }] };
    }],
  ]);

  const workspaceStatesRows = [{ workspace_key: 'user-1', data: { clients: [] } }];
  const { filesUploaded } = await runDailyBackup(ENV, workspaceStatesRows, '2026-09-14T06:00:00.000Z', fetchImpl);

  assert.deepEqual(filesUploaded, [
    'workspace_states',
    'whatsapp_events',
    'technical_documents',
    'technical_document_history',
    'copilot_states',
  ]);
  assert.equal(uploaded.length, 5);
  const workspaceUpload = uploaded.find((item) => item.path === '2026-09-14/workspace_states.json');
  assert.deepEqual(workspaceUpload.body, workspaceStatesRows);
  const whatsappUpload = uploaded.find((item) => item.path === '2026-09-14/whatsapp_events.json');
  assert.deepEqual(whatsappUpload.body, [{ id: 'whatsapp_events-row' }]);
});

test('runDailyBackup no llama a las tablas del cotizador/inventario que comparten el mismo proyecto de Supabase', async () => {
  const requestedTables = [];
  const fetchImpl = fakeFetchImpl([
    [/\/storage\/v1\/object\/backups\//, () => ({ ok: true, status: 200 })],
    [/\/rest\/v1\//, (url) => {
      requestedTables.push(url.split('/rest/v1/')[1].split('?')[0]);
      return { ok: true, status: 200, json: async () => [] };
    }],
  ]);

  await runDailyBackup(ENV, [], '2026-09-14T06:00:00.000Z', fetchImpl);

  for (const foreignTable of ['catalog_products', 'sales_quotes', 'commercial_rules', 'inventory_balances']) {
    assert.ok(!requestedTables.includes(foreignTable), `no debería pedirse "${foreignTable}" - pertenece a otra app`);
  }
});

test('runDailyBackup falla si una tabla no se puede subir, sin intentar disimularlo', async () => {
  const fetchImpl = fakeFetchImpl([
    [/\/storage\/v1\/object\/backups\/.*workspace_states/, () => ({ ok: true, status: 200 })],
    [/\/rest\/v1\/whatsapp_events/, () => ({ ok: false, status: 500 })],
  ]);

  await assert.rejects(
    runDailyBackup(ENV, [], '2026-09-14T06:00:00.000Z', fetchImpl),
    /whatsapp_events/,
  );
});

test('cleanupOldBackups borra solo las carpetas de fecha más viejas que el período de retención', async () => {
  const removedPrefixes = [];
  const fetchImpl = fakeFetchImpl([
    [/\/storage\/v1\/object\/list\/backups/, () => ({
      ok: true,
      status: 200,
      json: async () => [
        { name: '2026-08-01' }, // vieja, se borra
        { name: '2026-08-20' }, // vieja, se borra
        { name: '2026-09-10' }, // dentro del período, se conserva
        { name: '.emptyFolderPlaceholder' }, // no es una fecha, se ignora
      ],
    })],
    [/\/storage\/v1\/object\/remove/, (_url, options) => {
      removedPrefixes.push(JSON.parse(options.body).prefixes);
      return { ok: true, status: 200 };
    }],
  ]);

  // "Hoy" = 2026-09-14, retención de 14 días -> corte en 2026-08-31.
  const deleted = await cleanupOldBackups(ENV, '2026-09-14T06:00:00.000Z', fetchImpl);

  assert.deepEqual(deleted, ['2026-08-01', '2026-08-20']);
  assert.equal(removedPrefixes.length, 2);
  assert.ok(removedPrefixes[0].includes('2026-08-01/workspace_states.json'));
  assert.ok(removedPrefixes[0].includes('2026-08-01/whatsapp_events.json'));
});
