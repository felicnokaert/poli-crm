import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { ProductHub } = await loadJsxModule('src/ProductHub.jsx');

const tables = {
  ml_items: [
    { id: 'MLA1', seller_id: 1, status: 'active', title: 'Resina Epoxi 450 g', price: 27000, listing_type: 'gold_special', sku: 'RE-608-0.450', visits_7d: 1, visits_30d: 10 },
    { id: 'MLA2', seller_id: 2, status: 'active', title: 'Timbre wifi', price: 40000, listing_type: 'gold_pro', sku: 'TIM-1' },
  ],
  ml_item_economics: [{ id: 'MLA1', units_30d: 4, revenue_30d: 108000, fees_30d: 14000, shipping_per_unit: 3000 }],
  catalog_variants: [{ id: 'v1', sku: 'RE-608-0.450', name: 'Resina epoxi 450 g', product_id: 'p1', active: true }],
  catalog_products: [{ id: 'p1', status: 'vigente', photo_path: '' }],
  variant_prices: [{ price_list_id: 'l1', variant_id: 'v1', min_quantity: 1, max_quantity: null, amount: 468.91, status: 'confirmado' }],
  price_lists: [{ id: 'l1', name: 'Lista minorista', currency: 'USD', vat_rate: 0.21, valid_from: '2026-01-01', valid_until: null, status: 'vigente' }],
};

function query(rows) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, order() { return chain; }, in() { return chain; },
    range() { return Promise.resolve({ data: rows, error: null }); },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return chain;
}
const supabase = { from: (name) => query(tables[name] || []), rpc: () => Promise.resolve({ data: [{ seller_id: 1, nickname: 'POLIPLAST SRL' }, { seller_id: 2, nickname: 'PURMAC' }] }) };

test('Productos muestra ⚠ Precio raro, lo que no está en el cotizador y el detalle por canal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rate: 1500, source: 'BNA', quotationDate: '20/11/2026' }) });
  try {
    render(React.createElement(ProductHub, { supabase }));
    await waitFor(() => screen.getByText('Resina epoxi 450 g'));
    assert.ok(screen.getAllByText(/⚠ Precio raro/).length >= 2, 'el filtro y la etiqueta del producto');
    assert.ok(screen.getAllByText(/no está en el cotizador/).length);
    assert.ok(screen.getByText(/Dólar BNA billete vendedor: \$ 1\.500/));
    fireEvent.click(screen.getByText('Resina epoxi 450 g'));
    await waitFor(() => screen.getByText('Lo que queda por unidad en cada canal'));
    assert.ok(screen.getByText('Mercado Libre Clásica'));
    assert.ok(screen.getAllByText(/Precio raro: en Mercado Libre se vende a/).length);
    fireEvent.click(screen.getByRole('tab', { name: /No están en el cotizador/ }));
    await waitFor(() => assert.equal(screen.queryByText('Resina epoxi 450 g'), null));
    assert.ok(screen.getByText('Timbre wifi'));
  } finally { globalThis.fetch = originalFetch; cleanup(); }
});
