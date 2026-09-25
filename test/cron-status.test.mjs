import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordCronRun, DAILY_MAINTENANCE_KEY } from '../lib/cron-status.mjs';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv' };

test('recordCronRun hace upsert por key en crm_system_status con la service role', async () => {
  const calls = [];
  await recordCronRun(ENV, { ok: true, detail: { workspacesProcessed: 4 } }, '2026-09-25T06:29:00.000Z', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201 };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/crm_system_status?on_conflict=key');
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.headers.Prefer, /merge-duplicates/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer srv');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.key, DAILY_MAINTENANCE_KEY);
  assert.equal(body.last_run_at, '2026-09-25T06:29:00.000Z');
  assert.equal(body.ok, true);
  assert.deepEqual(body.detail, { workspacesProcessed: 4 });
});

test('recordCronRun registra ok=false cuando hubo workspaces con error', async () => {
  let body;
  await recordCronRun(ENV, { ok: false }, '2026-09-25T06:29:00.000Z', async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 201 };
  });
  assert.equal(body.ok, false);
  assert.equal(body.detail, null);
});

test('recordCronRun tira error claro si Supabase responde 4xx (sin reintentar)', async () => {
  let attempts = 0;
  await assert.rejects(
    recordCronRun(ENV, { ok: true }, '2026-09-25T06:29:00.000Z', async () => {
      attempts += 1;
      return { ok: false, status: 403 };
    }),
    /status 403/,
  );
  assert.equal(attempts, 1);
});

test('recordCronRun reintenta ante un 503 pasajero', async () => {
  let attempts = 0;
  await recordCronRun(ENV, { ok: true }, '2026-09-25T06:29:00.000Z', async () => {
    attempts += 1;
    return attempts < 2 ? { ok: false, status: 503 } : { ok: true, status: 201 };
  });
  assert.equal(attempts, 2);
});
