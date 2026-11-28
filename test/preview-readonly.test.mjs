import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeWrite, isWrite } from '../src/preview-readonly.mjs';

const REST = 'https://x.supabase.co/rest/v1';

test('Solo lectura: lee todo, no escribe nada', () => {
  assert.equal(isWrite(`${REST}/clients?select=*`, { method: 'GET' }), false);
  assert.equal(isWrite(`${REST}/workspace_states?workspace_key=eq.1`, { method: 'PATCH' }), true);
  assert.equal(isWrite(`${REST}/sales_quotes`, { method: 'POST' }), true);
  assert.equal(isWrite(`${REST}/rpc/admin_list_users`, { method: 'POST' }), false);
  assert.equal(isWrite('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' }), false);
  assert.equal(isWrite('https://x.supabase.co/storage/v1/object/entregas/a.pdf', { method: 'POST' }), true);
  assert.equal(isWrite('/api/admin-users', { method: 'POST', body: JSON.stringify({ action: 'assistant', question: 'hola' }) }), false);
  assert.equal(isWrite('/api/admin-users', { method: 'POST', body: JSON.stringify({ action: 'app-report', op: 'list' }) }), false);
  assert.equal(isWrite('/api/admin-users', { method: 'POST', body: JSON.stringify({ action: 'app-report', op: 'send', text: 'x' }) }), true);
});

test('Solo lectura: responde como si se hubiera guardado', async () => {
  const single = await fakeWrite(`${REST}/sales_quotes`, { method: 'POST', headers: { Accept: 'application/vnd.pgrst.object+json' }, body: JSON.stringify({ quote_number: 'PA-1' }) }).json();
  assert.equal(single.quote_number, 'PA-1');
  const list = await fakeWrite(`${REST}/tasks`, { method: 'POST', body: JSON.stringify({ id: 't' }) }).json();
  assert.deepEqual(list, [{ id: 't' }]);
  const api = await fakeWrite('/api/admin-users', { method: 'POST', body: '{}' }).json();
  assert.equal(api.readOnly, true);
});

test('las funciones que guardan (Logística, Entregas) también se frenan', () => {
  const CONTEO = 'https://coldwrbfxpdfutbekysr.supabase.co/rest/v1/rpc';
  for (const fn of ['etq_escanear', 'etq_deshacer', 'etq_guardar_config', 'guardar_admin', 'borrar_admin', 'cambiar_pin', 'dosif_resync_planilla']) {
    assert.equal(isWrite(`${CONTEO}/${fn}`, { method: 'POST' }), true, fn);
  }
  assert.equal(isWrite(`${REST}/rpc/entregas_cambiar_estado`, { method: 'POST' }), true);
  for (const fn of ['dosif_admin_login', 'verificar_pin', 'dosif_planilla_url']) assert.equal(isWrite(`${CONTEO}/${fn}`, { method: 'POST' }), false, fn);
  assert.equal(isWrite(`${REST}/rpc/search_ml_knowledge`, { method: 'POST' }), false);
  assert.equal(isWrite('https://coldwrbfxpdfutbekysr.supabase.co/rest/v1/kv_store', { method: 'POST' }), true);
});
