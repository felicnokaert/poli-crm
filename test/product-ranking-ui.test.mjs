import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, waitFor, cleanup, fireEvent, screen } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { ProductRanking } = await loadJsxModule('src/ProductRanking.jsx');

function fakeSupabase(tables, missing = false) {
  return {
    from(table) {
      const chain = {
        select() { return chain; }, order() { return chain; }, gte() { return chain; }, range() { return chain; },
        then(resolve) {
          if (missing && table === 'contabilium_items') return resolve({ data: null, error: { code: 'PGRST205', message: 'Could not find the table public.contabilium_items' } });
          return resolve({ data: tables[table] || [], error: null });
        },
      };
      return chain;
    },
  };
}

const today = new Date().toISOString().slice(0, 10);

test('Ranking: muestra productos ordenados, cambia a rubros y avisa si falta la tabla', async () => {
  try {
    const tables = {
      contabilium_items: [
        { company: 'POLIPLAST', fecha: today, signo: 1, codigo: 'IF-1517', nombre: 'iso', cantidad: 2, neto: 1000 },
        { company: 'POLIPLAST', fecha: today, signo: 1, codigo: 'RE-608-750', nombre: 'Resina 750', cantidad: 10, neto: 300, rubro: 'Resinplast' },
      ],
      catalog_variants: [{ sku: 'IF-1517', product_id: 'P1' }],
      catalog_products: [{ id: 'P1', name: '1517 ISO Visco Mol', family: 'Poliuretano', subfamily: 'Isocianatos' }],
    };
    render(React.createElement(ProductRanking, { supabase: fakeSupabase(tables) }));
    await waitFor(() => assert.ok(screen.getByText('1517 ISO Visco Mol')));
    const names = [...document.querySelectorAll('.ranking-name strong')].map((node) => node.textContent);
    assert.deepEqual(names, ['1517 ISO Visco Mol', 'Resina 750']);
    fireEvent.click(screen.getByRole('tab', { name: 'Rubros' }));
    await waitFor(() => assert.ok(screen.getByText('Poliuretano', { selector: 'strong' })));
    cleanup();
    render(React.createElement(ProductRanking, { supabase: fakeSupabase({}, true) }));
    await waitFor(() => assert.ok(screen.getByText(/falta aplicar la migración/)));
  } finally { cleanup(); }
});
