import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);
const { ShopifyBoard } = await loadJsxModule('src/ShopifyBoard.jsx');

const fake = (tables, error) => ({
  from: (table) => { const chain = { select: () => chain, order: () => chain, range: () => Promise.resolve(error ? { data: null, error } : { data: tables[table] || [], error: null }) }; return chain; },
});

test('Shopify: con datos muestra el resumen y "Ver cuáles" lleva a Productos filtrados', async () => {
  const supabase = fake({
    shopify_products: [{ id: 'p1', title: 'Balde plástico 20 L', status: 'ACTIVE', vendor: 'Grupo Poliplast', product_type: 'Baldes', tags: '', description_length: 0, seo_title: '', seo_description: '', media_count: 1, total_inventory: 10, synced_at: '2026-10-24T09:00:00Z', online_url: '' }],
    shopify_variants: [{ id: 'v1', product_id: 'p1', sku: 'BA-20', price: 10000, inventory_quantity: 10, options: [] }],
    shopify_daily: [],
  });
  render(React.createElement(ShopifyBoard, { supabase, isAdmin: false }));
  await waitFor(() => screen.getByText('Productos activos'));
  assert.ok(screen.getAllByText(/Sin descripción/).length > 0);
  fireEvent.click(screen.getAllByText('Ver cuáles')[0]);
  await waitFor(() => screen.getByLabelText('Buscar producto'));
  assert.ok(screen.getByText('Balde plástico 20 L'));
});

test('Shopify: sin tablas o sin datos explica cómo conectarlo (solo el admin ve los pasos)', async () => {
  render(React.createElement(ShopifyBoard, { supabase: fake({}, { message: 'relation "shopify_products" does not exist' }), isAdmin: true }));
  await waitFor(() => screen.getByText('Conectar Shopify'));
  assert.ok(screen.getByText(/20261024_shopify\.sql/));
  cleanup();
  render(React.createElement(ShopifyBoard, { supabase: fake({ shopify_products: [], shopify_variants: [], shopify_daily: [] }), isAdmin: false }));
  await waitFor(() => screen.getByText('Conectar Shopify'));
  assert.equal(screen.queryByText(/Admin API access token/), null);
});
