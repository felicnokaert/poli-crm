import test from 'node:test';
import assert from 'node:assert/strict';
import { derivationsFor } from '../src/derivations.mjs';
import { addDerivation } from '../lib/whatsapp-autoreply.mjs';
import { REJECTION_REASONS } from '../src/prospect-model.mjs';

const items = [{ id: 'a', to: 'Juan', at: '2026-11-03T10:00:00Z' }, { id: 'b', to: 'Brenda', at: '2026-11-03T11:00:00Z' }];

test('cada persona ve sus derivaciones; el administrador ve todas; lo resuelto sale', () => {
  assert.deepEqual(derivationsFor(items, { firstName: 'Juan' }).map((i) => i.id), ['a']);
  assert.equal(derivationsFor(items, { isAdmin: true }).length, 2);
  assert.deepEqual(derivationsFor(items, { isAdmin: true, done: ['a'] }).map((i) => i.id), ['b']);
  assert.equal(derivationsFor(items, {}).length, 0);
});

test('addDerivation guarda quién, cuándo y de qué contacto, sin textos', async () => {
  const calls = [];
  const http = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
  };
  await addDerivation({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, http, { event_id: 'e1', customer_wa_id: '5491100000000', customer_name: 'Ana', text_body: 'secreto' }, 'Juan');
  const write = calls.find((call) => call.options.method === 'POST');
  assert.ok(write, 'debe escribir');
  assert.ok(!write.options.body.includes('secreto'));
  assert.ok(write.options.body.includes('wa-derivations') && write.options.body.includes('Juan'));
});

test('el motivo «Es revendedor» está entre los rechazos de un toque', () => {
  assert.ok(REJECTION_REASONS.includes('Es revendedor (no es perfil)'));
});
