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
  assert.deepEqual(link.summary, { activeItems: 5, withSku: 4, noSku: 1, matchedItems: 3, matchedSkus: 2, unmatchedSkus: 1, unmatchedItems: 1, duplicatedSkus: 1, catalogSkus: 3, catalogCovered: 2, photoGain: 1, photosApproved: 0 });
});

test('el SKU de la publicación sale del atributo SELLER_SKU, del atributo SKU o del campo del vendedor', () => {
  assert.equal(skuOfItem({ attributes: [{ id: 'SELLER_SKU', name: 'SKU', value_name: 're-608 -1' }] }), 'RE-608-1');
  assert.equal(skuOfItem({ attributes: [{ id: 'X', name: 'sku', value_name: 'kt-1' }] }), 'KT-1');
  assert.equal(skuOfItem({ attributes: [], seller_custom_field: ' ps 810 ' }), 'PS810');
  assert.equal(skuOfItem({ attributes: [{ id: 'BRAND', name: 'Marca', value_name: 'Penosil' }] }), '');
  assert.equal(itemRow({ id: 'MLA1', attributes: [{ id: 'SELLER_SKU', name: 'SKU', value_name: 'RE-608-1' }] }, 's1').sku, 'RE-608-1');
});

function fakeSupabase(calls = [], photoRows = []) {
  const tables = { catalog_products: products, catalog_variants: variants, ml_items: items.filter((entry) => entry.status === 'active'), catalog_product_photos: photoRows };
  const make = (table, data) => {
    const b = {
      select: () => b, eq: () => b, range: () => Promise.resolve({ data, error: null }),
      upsert: async (rows, options) => { calls.push({ table, op: 'upsert', rows, options }); return { error: null }; },
      delete: () => ({ eq: async (column, value) => { calls.push({ table, op: 'delete', column, value }); return { error: null }; } }),
    };
    return b;
  };
  return { from: (table) => make(table, tables[table] || []), rpc: async () => ({ data: [{ seller_id: 's1', nickname: 'POLIPLAST SRL' }] }) };
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

test('una foto aprobada saca al producto de "para sumar" y queda como aprobada', () => {
  const link = linkMlToCatalog({ products, variants, items, photos: [{ product_id: 'p1', url: 'https://img/x.jpg' }] });
  assert.equal(link.summary.photoGain, 0);
  assert.equal(link.summary.photosApproved, 1);
  assert.equal(link.matched[0].approvedPhoto.url, 'https://img/x.jpg');
});

test('usa la foto grande de la publicación si está y avisa si solo hay miniatura', () => {
  const withPicture = [item('M2', 'RE-608-1', { sold_quantity: 10, picture_url: 'https://img/grande.jpg' })];
  const big = linkMlToCatalog({ products, variants, items: withPicture });
  assert.equal(big.matched[0].photoUrl, 'https://img/grande.jpg');
  assert.equal(big.matched[0].photoIsSmall, false);
  const small = linkMlToCatalog({ products, variants, items: [item('M2', 'RE-608-1')] });
  assert.equal(small.matched[0].photoUrl, 'https://img/M2.jpg');
  assert.equal(small.matched[0].photoIsSmall, true);
});

test('un administrador aprueba la foto de un producto y se guarda aparte, sin tocar el catálogo', async () => {
  const { MlCatalogLink } = await loadJsxModule('src/MlCatalogLink.jsx');
  const calls = [];
  render(React.createElement(MlCatalogLink, { supabase: fakeSupabase(calls), isAdmin: true, userEmail: 'felipe@grupopoliplast.com.ar' }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Fotos para sumar (1)' })));
  fireEvent.click(screen.getByRole('button', { name: 'Usar esta foto' }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Fotos para sumar (0)' })));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'catalog_product_photos');
  assert.deepEqual({ ...calls[0].rows[0], approved_at: undefined }, { product_id: 'p1', url: 'https://img/M2.jpg', source: 'mercadolibre', item_id: 'M2', sku: 'RE-608-1', approved_by: 'felipe@grupopoliplast.com.ar', approved_at: undefined });
  assert.deepEqual(calls[0].options, { onConflict: 'product_id' });
  fireEvent.click(screen.getByRole('tab', { name: 'Fotos aprobadas (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Fotos aprobadas (0)' })));
  assert.deepEqual(calls[1], { table: 'catalog_product_photos', op: 'delete', column: 'product_id', value: 'p1' });
});

test('quien no es administrador ve las fotos pero no puede aprobarlas', async () => {
  const { MlCatalogLink } = await loadJsxModule('src/MlCatalogLink.jsx');
  const calls = [];
  render(React.createElement(MlCatalogLink, { supabase: fakeSupabase(calls), isAdmin: false }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Fotos para sumar (1)' })));
  assert.equal(screen.queryByRole('button', { name: 'Usar esta foto' }), null);
  assert.ok(screen.getByText(/Las aprueba un administrador/));
});

test('las fotos que subió Claude aparecen "sin revisar", con la publicación de origen, y se pueden quitar', async () => {
  const { MlCatalogLink } = await loadJsxModule('src/MlCatalogLink.jsx');
  const calls = [];
  const photoRows = [{ product_id: 'p1', url: 'https://img/M2.jpg', item_id: 'M2', sku: 'RE-608-1', approved_by: 'claude - falta revisar' }];
  render(React.createElement(MlCatalogLink, { supabase: fakeSupabase(calls, photoRows), isAdmin: true, userEmail: 'felipe@grupopoliplast.com.ar' }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Fotos sin revisar (1)' })));
  assert.ok(screen.getByRole('tab', { name: 'Fotos para sumar (0)' }), 'ya no figura como pendiente de sumar');
  fireEvent.click(screen.getByRole('tab', { name: 'Fotos sin revisar (1)' }));
  assert.ok(screen.getByText('RESINA EPOXI 1KG'));
  assert.ok(screen.getByText('foto de esta'));
  fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
  await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Fotos sin revisar (0)' })));
  assert.deepEqual(calls[0], { table: 'catalog_product_photos', op: 'delete', column: 'product_id', value: 'p1' });
});

test('las miniaturas de Mercado Libre se pasan a https (el navegador bloquea http y la base solo acepta https)', () => {
  const result = linkMlToCatalog({
    products: [{ id: 'p1', name: 'P', photo_path: '' }],
    variants: [{ id: 'v1', product_id: 'p1', sku: 'ABC-1' }],
    items: [{ id: 'MLA1', status: 'active', sku: 'ABC-1', thumbnail: 'http://http2.mlstatic.com/D_1-I.jpg', sold_quantity: 3 }],
  });
  assert.equal(result.matched[0].photoUrl, 'https://http2.mlstatic.com/D_1-I.jpg');
  assert.equal(result.matched[0].thumbnail, 'https://http2.mlstatic.com/D_1-I.jpg');
});
