import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, prospectAiSearch, textOf } from '../lib/prospect-ai.mjs';

test('Prospección con IA: costo con búsquedas web y texto de la respuesta', () => {
  assert.deepEqual(costOf('claude-haiku-5-5', { input_tokens: 100000, output_tokens: 4000, server_tool_use: { web_search_requests: 5 } }), { searches: 5, usd: 0.062 });
  assert.equal(textOf([{ type: 'server_tool_use' }, { type: 'text', text: 'A' }, { type: 'web_search_tool_result' }, { type: 'text', text: 'B' }]), 'AB');
});

test('Prospección con IA: respeta el tope diario y arma el pedido con búsqueda web', async () => {
  const calls = [];
  let status = [{ detail: { day: '2026-11-26', count: 0 } }];
  const http = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, method: init.method });
    if (String(url).includes('api.anthropic.com')) return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Empresa | Rubro\nNáutica Sur | astillero' }], usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 2 } } }) };
    if (init.method === 'POST' || init.method === 'PATCH') { const row = JSON.parse(init.body)[0]; if (row?.detail) status = [{ detail: row.detail }]; return { ok: true, status: 201, json: async () => [], text: async () => '' }; }
    return { ok: true, status: 200, json: async () => status, text: async () => JSON.stringify(status) };
  };
  const env = { ANTHROPIC_API_KEY: 'x', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'k', PROSPECT_AI_DAILY_CAP: '1' };
  const now = Date.parse('2026-11-26T15:00:00Z');
  const ok = await prospectAiSearch({ prompt: 'Actuá como investigador comercial… '.repeat(5) }, env, http, now);
  assert.equal(ok.body.ok, true);
  assert.match(ok.body.text, /Náutica Sur/);
  const ai = calls.find((call) => String(call.url).includes('anthropic'));
  assert.equal(ai.body.tools[0].name, 'web_search');
  assert.equal(ai.body.tools[0].max_uses, 6);
  const again = await prospectAiSearch({ prompt: 'Actuá como investigador comercial… '.repeat(5) }, env, http, now);
  assert.equal(again.status, 429);
});

test('Prospección con IA: «Valor N/10» de la IA pasa a ser el puntaje del prospecto', async () => {
  const { prospectFieldsFromRow } = await import('../src/prospect-import.mjs');
  assert.equal(prospectFieldsFromRow({ company: 'Frío Sur', fit: 'Valor 8/10 · paneles de frío' }).sheetScore, 8);
  assert.equal(prospectFieldsFromRow({ company: 'Otra', fit: 'Valor 9/10', sheetScore: '60' }).sheetScore, 60);
});
