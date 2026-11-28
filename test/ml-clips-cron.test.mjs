import test from 'node:test';
import assert from 'node:assert/strict';
import { mercadoLibreClipsCron } from '../lib/mercadolibre.mjs';

test('el cron de clips revisa solo las activas sin clip o sin dato que no se miraron en 20 h', async () => {
  const asked = [];
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
  const http = async (url, options = {}) => {
    const text = String(url);
    if (text.includes('api.mercadolibre.com')) {
      asked.push(text);
      if (text.includes('/performance')) return json({ score: 70, buckets: [{ variables: [{ rules: [{ key: 'UP_HAS_SHORTS', status: 'COMPLETED' }] }] }] });
      return json({});
    }
    const path = text.split('/rest/v1/')[1] || '';
    if (path.startsWith('ml_item_health') && !options.method) return json([{ id: 'MLA2' }]);
    if (path.startsWith('ml_items') && !options.method) return json([{ id: 'MLA1', seller_id: '1' }, { id: 'MLA2', seller_id: '1' }]);
    if (path.startsWith('ml_accounts') && !options.method) return json([{ seller_id: '1', nickname: 'X', access_token: 't', expires_at: '2999-01-01T00:00:00Z' }]);
    return json(null, 201);
  };
  const result = await mercadoLibreClipsCron({ headers: { authorization: 'Bearer s' } }, { CRON_SECRET: 's', ML_CLIENT_ID: 'a', ML_CLIENT_SECRET: 'b', SUPABASE_URL: 'https://x.supabase.co' }, http);
  assert.equal(result.status, 200);
  assert.equal(result.body.checked, 1);
  assert.ok(asked.some((url) => url.includes('/item/MLA1/performance')));
  assert.ok(!asked.some((url) => url.includes('/item/MLA2/performance')), 'la revisada hace poco no se repite');
});
