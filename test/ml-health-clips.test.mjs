import test from 'node:test';
import assert from 'node:assert/strict';
import { hasClip, itemHealth } from '../lib/ml-health.mjs';

const quality = (status) => ({ score: 75, buckets: [{ key: 'USER_PRODUCT', variables: [{ key: 'UP_SHORTS', rules: [{ key: 'UP_HAS_SHORTS', status }] }] }] });

test('el clip sale de la regla UP_HAS_SHORTS de la calidad', () => {
  assert.equal(hasClip(quality('COMPLETED')), true);
  assert.equal(hasClip(quality('PENDING')), false);
  assert.equal(hasClip({ score: 90, buckets: [] }), null);
});

test('al revisar la calidad se marca el clip en la publicación', async () => {
  const patches = [];
  const store = { upsert: async () => {}, patch: async (table, filter, values) => { patches.push([table, filter, values]); } };
  const get = async (path) => {
    if (path.includes('/performance')) return path.includes('MLA1') ? quality('COMPLETED') : quality('PENDING');
    return {};
  };
  const result = await itemHealth({ seller_id: 1 }, 't', ['MLA1', 'MLA2'], { get, store, pause: 0 });
  assert.equal(result.clips, 1);
  assert.deepEqual(patches, [['ml_items', 'id=in.(MLA1)', { clips_count: 1 }], ['ml_items', 'id=in.(MLA2)', { clips_count: 0 }]]);
});
