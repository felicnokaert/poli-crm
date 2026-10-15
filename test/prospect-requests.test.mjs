import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRequestsApi, remoteLabel } from '../src/prospect-requests.mjs';

test('sin Supabase no hay API de pedidos', () => {
  assert.equal(makeRequestsApi(null), null);
});

test('crea el pedido con el correo en minúscula y consulta por ids', async () => {
  const calls = [];
  const supabase = { from: (table) => ({
    insert: async (row) => { calls.push(['insert', table, row]); return { error: null }; },
    select: () => ({ in: async (col, ids) => { calls.push(['select', table, col, ids]); return { data: [{ id: ids[0], status: 'lista' }], error: null }; } }),
  }) };
  const api = makeRequestsApi(supabase);
  await api.create({ id: 'j1', family: 'Penosil', scope: 'Córdoba', count: 20, notes: '', prompt: 'P' }, ' Felipe@X.com ');
  assert.equal(calls[0][2].user_email, 'felipe@x.com');
  assert.equal(calls[0][2].wanted, 20);
  assert.equal((await api.fetch(['j1']))[0].status, 'lista');
  assert.deepEqual(await api.fetch([]), []);
});

test('las etiquetas de estado son claras', () => {
  assert.match(remoteLabel({ status: 'pendiente' }), /esperando a Claude/);
  assert.match(remoteLabel({ status: 'en_curso', progress: 'verificando 8 sitios' }), /verificando 8 sitios/);
  assert.equal(remoteLabel({ status: 'lista' }), 'Resultado listo');
});
