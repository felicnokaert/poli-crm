import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveWithConcurrency } from '../src/workspace-save.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';
import { buildIntakeTask, insertIntakeTaskAtomically } from '../lib/tasks-intake.mjs';

const merge = (local, remote) => ({ ...remote, ...local, tasks: [...remote.tasks, ...local.tasks.filter((t) => !remote.tasks.some((r) => r.id === t.id))] });

test('guarda directo si la version no cambio', async () => {
  const calls = [];
  const result = await saveWithConcurrency({
    data: { tasks: [{ id: 'a' }] },
    version: 'v1',
    tryUpdate: async (_data, version) => { calls.push(version); return { ok: true, version: 'v2' }; },
    fetchRemote: async () => { throw new Error('no deberia leer'); },
    forceWrite: async () => { throw new Error('no deberia forzar'); },
    merge,
  });
  assert.deepEqual(calls, ['v1']);
  assert.equal(result.version, 'v2');
  assert.equal(result.merged, false);
});

test('si el servidor escribio en el medio, une y reintenta sin perder la tarea del servidor', async () => {
  const remote = { data: { tasks: [{ id: 'server-task' }] }, version: 'v9' };
  const written = [];
  const result = await saveWithConcurrency({
    data: { tasks: [{ id: 'local-task' }] },
    version: 'v1',
    tryUpdate: async (data, version) => {
      if (version !== 'v9') return { ok: false };
      written.push(data);
      return { ok: true, version: 'v10' };
    },
    fetchRemote: async () => remote,
    forceWrite: async () => { throw new Error('no deberia forzar'); },
    merge,
  });
  assert.equal(result.merged, true);
  assert.deepEqual(written[0].tasks.map((t) => t.id).sort(), ['local-task', 'server-task']);
  assert.equal(result.version, 'v10');
});

test('si el conflicto no se resuelve, escribe igual lo ultimo unido (nunca queda trabado)', async () => {
  let forced;
  const result = await saveWithConcurrency({
    data: { tasks: [{ id: 'a' }] },
    version: 'v1',
    tryUpdate: async () => ({ ok: false }),
    fetchRemote: async () => ({ data: { tasks: [{ id: 'b' }] }, version: 'vX' }),
    forceWrite: async (data) => { forced = data; return { version: 'vF' }; },
    merge,
    maxAttempts: 3,
  });
  assert.deepEqual(forced.tasks.map((t) => t.id).sort(), ['a', 'b']);
  assert.equal(result.version, 'vF');
});

test('sin version conocida (primer guardado) hace el alta directa', async () => {
  let forced = false;
  const result = await saveWithConcurrency({
    data: { tasks: [] },
    version: undefined,
    tryUpdate: async () => { throw new Error('no deberia'); },
    fetchRemote: async () => null,
    forceWrite: async () => { forced = true; return { version: 'v1' }; },
    merge,
  });
  assert.equal(forced, true);
  assert.equal(result.version, 'v1');
});

test('si la fila desaparecio, la vuelve a crear', async () => {
  let forced = false;
  await saveWithConcurrency({
    data: { tasks: [] },
    version: 'v1',
    tryUpdate: async () => ({ ok: false }),
    fetchRemote: async () => null,
    forceWrite: async () => { forced = true; return { version: 'v2' }; },
    merge,
  });
  assert.equal(forced, true);
});

const EMPTY = { clients: [], interactions: [], tasks: [], inbox: [], opportunities: [], sales: [] };

test('mergeWorkspaceState conserva las tareas del servidor y dailySignals mas reciente', () => {
  const local = { ...EMPTY, tasks: [{ id: 'l1', updatedAt: '2026-09-26T10:00:00Z' }], dailySignals: { calculatedAt: '2026-09-24T06:00:00.000Z' } };
  const remote = { ...EMPTY, tasks: [{ id: 's1', externalId: 'ml-1', updatedAt: '2026-09-26T09:00:00Z' }], dailySignals: { calculatedAt: '2026-09-26T06:29:00.000Z' } };
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.tasks.map((t) => t.id).sort(), ['l1', 's1']);
  assert.equal(merged.dailySignals.calculatedAt, '2026-09-26T06:29:00.000Z');
});

test('mergeWorkspaceState no inventa dailySignals si ninguno lo tiene', () => {
  const merged = mergeWorkspaceState({ ...EMPTY }, { ...EMPTY });
  assert.equal('dailySignals' in merged, false);
});

test('insertIntakeTaskAtomically llama a la funcion SQL y devuelve wasNew segun el booleano', async () => {
  const task = buildIntakeTask({ externalId: 'x', origin: 'o', title: 't' }, '2026-09-26T00:00:00.000Z', () => 'id-1');
  const calls = [];
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
  const created = await insertIntakeTaskAtomically(env, 'ws', task, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => true };
  });
  assert.equal(created.wasNew, true);
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/append_workspace_task');
  assert.equal(calls[0].body.p_workspace_key, 'ws');
  assert.equal(calls[0].body.p_task.externalId, 'x');
  const duplicate = await insertIntakeTaskAtomically(env, 'ws', task, async () => ({ ok: true, status: 200, json: async () => false }));
  assert.equal(duplicate.wasNew, false);
  await assert.rejects(insertIntakeTaskAtomically(env, 'ws', task, async () => ({ ok: false, status: 500 })), /status 500/);
});
