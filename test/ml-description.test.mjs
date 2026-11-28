import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDescription } from '../lib/mercadolibre.mjs';
import { issuesOf, variantsWithoutSku } from '../src/ml-board.mjs';

const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });

test('descripción: texto plano, HTML, catálogo y falla sin pisar', async () => {
  assert.equal(await fetchDescription({ id: 'A' }, 't', async () => json({ plain_text: 'Hola' })), 'Hola');
  assert.match(await fetchDescription({ id: 'A' }, 't', async () => json({ plain_text: '', text: '<p>Uno<br/>dos</p>' })), /Uno\s+dos/);
  const catalog = async (url) => (String(url).includes('/products/') ? json({ short_description: { content: 'Del catálogo' } }) : json({ plain_text: '' }));
  assert.equal(await fetchDescription({ id: 'A', catalog_product_id: 'MLA9' }, 't', catalog), 'Del catálogo');
  assert.equal(await fetchDescription({ id: 'A' }, 't', async () => json({ message: 'boom' }, 500)), undefined);
  assert.equal(await fetchDescription({ id: 'A' }, 't', async () => json({ message: 'not_found' }, 404)), '');
});

test('variantes sin SKU y descripción sin dato', () => {
  const item = { sku: '', variation_skus: [{ id: '1', sku: 'A' }], variations_count: 3, description_length: null, status: 'active' };
  assert.equal(variantsWithoutSku(item), 2);
  const labels = issuesOf(item).map((issue) => issue.label);
  assert.ok(labels.includes('2 variantes sin SKU'));
  assert.ok(!labels.includes('Sin descripción'));
  assert.ok(issuesOf({ ...item, description_length: 0 }).some((issue) => issue.label === 'Sin descripción'));
});
