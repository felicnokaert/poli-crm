import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, waitFor, cleanup, fireEvent, screen } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { PriceAdmin } = await loadJsxModule('src/PriceAdmin.jsx');

// Base falsa: guarda lo que se escribe para comprobar qué mandaría la pantalla.
function fakeSupabase(tables, writes) {
  return {
    from(table) {
      const state = { table, filters: [], op: 'select', payload: null };
      const chain = {
        select() { return chain; }, order() { return chain; }, limit() { return chain; }, neq() { return chain; },
        eq(column, value) { state.filters.push([column, value]); return chain; },
        in(column, values) { state.filters.push([column, values]); return chain; },
        or() { return chain; }, ilike() { return chain; }, range() { return chain; },
        update(payload) { state.op = 'update'; state.payload = payload; return chain; },
        insert(payload) { state.op = 'insert'; state.payload = payload; return chain; },
        delete() { state.op = 'delete'; return chain; },
        then(resolve) {
          if (state.op !== 'select') { writes.push({ ...state }); return resolve({ data: null, error: null }); }
          let rows = tables[table] || [];
          for (const [column, value] of state.filters) rows = rows.filter((row) => (Array.isArray(value) ? value.includes(row[column]) : row[column] === value));
          return resolve({ data: rows, error: null });
        },
      };
      return chain;
    },
  };
}

test('Precios y condiciones: editar un tramo manda un update con el precio anterior anotado', async () => {
  try {
    const writes = [];
    const tables = {
      price_lists: [{ id: 'L1', name: 'Catalogo Maestro', brand: 'Grupo Poliplast', currency: 'USD', vat_rate: null, status: 'vigente', valid_from: '2026-09-11' }],
      catalog_variants: [{ id: 'V1', sku: 'PU-46', name: 'Espuma PU-46', product_id: 'P1', unit: 'u', active: true }],
      catalog_products: [{ id: 'P1', name: 'Espuma', brand: 'Penosil', family: 'Poliuretano' }],
      variant_prices: [{ id: 'R1', price_list_id: 'L1', variant_id: 'V1', min_quantity: 1, max_quantity: null, amount: 10, status: 'confirmado' }],
    };
    render(React.createElement(PriceAdmin, { supabase: fakeSupabase(tables, writes), who: 'felipe@grupopoliplast.com.ar' }));
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'PU-46' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const pick = await screen.findByRole('button', { name: /PU-46/ });
    fireEvent.click(pick);
    const amount = await screen.findByLabelText('Precio final');
    assert.equal(amount.value, '10');
    fireEvent.change(amount, { target: { value: '12,5' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0].op, 'update');
    assert.equal(writes[0].payload.amount, 12.5);
    assert.match(writes[0].payload.override_reason, /antes 10/);
  } finally { cleanup(); }
});

test('Precios y condiciones: el filtro «Solo precios raros» lista los que no cierran con Mercado Libre', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rate: 1000 }) });
  try {
    const tables = {
      price_lists: [{ id: 'L1', name: 'Catalogo Maestro', currency: 'USD', status: 'vigente', valid_from: '2026-09-11' }],
      catalog_variants: [{ id: 'V1', sku: 'PU-46', name: 'Espuma PU-46', product_id: 'P1', active: true }, { id: 'V2', sku: 'OK-1', name: 'Normal', product_id: 'P1', active: true }],
      variant_prices: [{ id: 'R1', price_list_id: 'L1', variant_id: 'V1', min_quantity: 1, amount: 10, status: 'confirmado' }, { id: 'R2', price_list_id: 'L1', variant_id: 'V2', min_quantity: 1, amount: 10, status: 'confirmado' }],
      ml_items: [{ sku: 'PU-46', status: 'active', price: 60000 }, { sku: 'OK-1', status: 'active', price: 12000 }],
      shopify_variants: [],
    };
    render(React.createElement(PriceAdmin, { supabase: fakeSupabase(tables, []), who: 'felipe@grupopoliplast.com.ar' }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    fireEvent.click(screen.getByRole('button', { name: /Solo precios raros/ }));
    await screen.findByText(/1 productos con la lista minorista/);
    assert.ok(screen.getByText('PU-46'));
    assert.ok(!screen.queryByText('OK-1'));
  } finally { globalThis.fetch = realFetch; cleanup(); }
});
