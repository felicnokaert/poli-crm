import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';
import { linkMlToCatalog, normSku } from '../src/ml-catalog-link.mjs';
import { skuOfItem, itemRow } from '../lib/mercadolibre.mjs';

afterEach(cleanup);

const products = [
  { id: 'p1', name: 'RESINA EPOXI 1KG', brand: 'RESINPLAST', family: 'Resinplast', photo_path: '' },
  { id: 'p2', name: 'ESPUMA 810ML', brand: 'PENOSIL', family: 'Penosil', photo_path: 'fotos/espuma.jpg' },
  { id: 'p3', name: 'BALDE 20L', brand: '', family: 'Baldes', photo_path: '' },
];
const variants = [
  { id: 'v1', product_id: 'p1', sku: 'RE-608-1' },
  { id: 'v2', product_id: 'p2', sku: 'PS-810ML-1' },
  { id: 'v3', product_id: 'p3', sku: 'BLBL-20-1' },
];
const item = (id, sku, extra = {}) => ({ id, seller_id: 's1', title: `Publicación ${id}`, permalink: `https://ml/${id}`, status: 'active', thumbnail: `https://img/${id}.jpg`, sold_quantity: 0, sku, ...extra });
const items = [
  item('M1', 're-608-1', { sold_quantity: 3 }),
  item('M2', 'RE-608-1', { sold_quantity: 10 }),
  item('M3', 'PS-810ML-1'),
  item('M4', 'KT-619-10'),
  item('M5', ''),
  item('M6', 'RE-608-1', { status: 'paused' }),
];

test('el SKU se normaliza en mayúsculas y sin espacios', () => {
  assert.equal(normSku(' re 608-1 '), 'RE608-1');
  assert.equal(normSku(null), '');
});

test('cruza por SKU: vinculados, sin producto, repetidos, sin SKU y fotos para sumar', () => {
  const link = linkMlToCatalog({ products, variants, items });
  assert.deepEqual(link.matched.map((entry) => entry.sku), ['RE-608-1', 'PS-810ML-1']);
  const resina = link.matched[0];
  assert.deepEqual(resina.items.map((publication) => publication.id), ['M2', 'M1'], 'la que más vendió primero; la pausada no entra');
  assert.equal(resina.needsPhoto, true, 'el catálogo no tiene foto y ML sí');
  assert.equal(link.matched[1].needsPhoto, false, 'ya tiene foto');
  assert.deepEqual(link.unmatched.map((entry) => entry.sku), ['KT-619-10']);
  assert.deepEqual(link.duplicated.map((entry) => entry.sku), ['RE-608-1']);
  assert.equal(link.noSku.length, 1);
  assert.deepEqual(link.summary, { activeItems: 5, withSku: 4, noSku: 1, matchedItems: 3, matchedSkus: 2, unmatchedSkus: 1, unmatchedItems: 1, duplicatedSkus: 1, catalogSkus: 3, catalogCovered: 2, photoGain: 1 });
});

test('el SKU de la publicación sale del atributo SELLER_SKU, del atributo SKU o del campo del vendedor', () => {
  assert.equal(skuOfItem({ attributes: [{ id: 'SELLER_SKU', name: 'SKU', value_name: 're-608 -1' }] }), 'RE-608-1');
  assert.equal(skuOfItem({ attributes: [{ id: 'X', name: 'sku', value_name: 'kt-1' }] }), 'KT-1');
  assert.equal(skuOfItem({ attributes: [], seller_custom_field: ' ps 810 ' }), 'PS810');
  assert.equal(skuOfItem({ attributes: [{ id: 'BRAND', name: 'Marca', value_name: 'Penosil' }] }), '');
  assert.equal(itemRow({ id: 'MLA1', attributes: [{ id: 'SELLER_SKU', name: 'SKU', value_name: 'RE-608-1' }] }, 's1').sku, 'RE-608-1');
});

function fakeSupabase() {
  const tables = { catalog_products: products, catalog_variants: variants, ml_items: items.filter((entry) => entry.status === 'active') };
  const make = (data) => { const b = { select: () => b, eq: () => b, range: () => Promise.resolve({ data, error: null }) }; return b; };
  return { from: (table) => make(tables[table] || []), rpc: async () => ({ data: [{ seller_id: 's1', nickname: 'POLIPLAST SRL' }] }) };
}

test('la pestaña muestra el resumen y cambia de lista', async () => {
  const { MlCatalogLink } = await loadJsxModule('src/MlCatalogLink.jsx');
  render(React.createElement(MlCatalogLink, { supabase: fakeSupabase() }));
  await waitFor(() => assert.ok(screen.getByText(/De 5 publicaciones activas, 4 tienen SKU y 3 \(2 SKU\) ya están en el catálogo/)));
  assert.ok(screen.getByRole('tab', { name: 'Fotos para sumar (1)' }));
  assert.ok(screen.getByText('RESINA EPOXI 1KG'));
  fireEvent.click(screen.getByRole('tab', { name: 'SKU de ML sin producto (1)' }));
  assert.ok(screen.getByText('KT-619-10'));
  assert.ok(screen.getByText('no está en el catálogo'));
  fireEvent.click(screen.getByRole('tab', { name: 'Publicaciones sin SKU (1)' }));
  assert.ok(screen.getByText('Publicación M5', { exact: false }));
});
