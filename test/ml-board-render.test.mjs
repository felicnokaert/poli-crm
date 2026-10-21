import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { MercadoLibreBoard } = await loadJsxModule('src/MercadoLibreBoard.jsx');

function fakeSupabase() {
  const tables = {
    ml_items: [{ id: 'MLA1', seller_id: '1', title: 'Espuma poliuretano', permalink: 'https://ml/1', status: 'active', price: 100, currency: 'ARS', sold_quantity: 5, available_quantity: 0, item_updated_at: 'x', clips_count: 0, visits_7d: 12, visits_30d: 80, description_length: 100 }],
    ml_questions: [{ item_id: 'MLA1' }],
    ml_account_metrics: [{ seller_id: '1', taken_on: '2026-10-21', data: { sales: { orders: 3, units: 4, amount: 4500, cancelled: 0, currency: 'ARS' }, visits: 300, conversion: 0.01, questionsPending: 2, days: [{ day: '2026-10-20', orders: 3, amount: 4500, units: 4, visits: 300 }], topItems: [{ id: 'MLA1', title: 'Espuma poliuretano', units: 4, amount: 4500 }], errors: [] } }],
  };
  const query = (table) => {
    const chain = { select: () => chain, order: () => chain, limit: () => Promise.resolve({ data: tables[table], error: null }), range: () => Promise.resolve({ data: tables[table], error: null }) };
    return chain;
  };
  return { from: query, rpc: async () => ({ data: [{ seller_id: '1', nickname: 'POLIPLAST SRL' }], error: null }) };
}

test('Mercado Libre: resumen con métricas y alertas; "Ver cuáles" lleva a Publicaciones filtradas', async () => {
  try {
    render(React.createElement(MercadoLibreBoard, { supabase: fakeSupabase() }));
    await waitFor(() => screen.getByText('Preguntas sin responder'));
    assert.ok(screen.getByText(/POLIPLAST SRL: 2 preguntas sin responder/));
    assert.ok(screen.getByText(/1 publicación activa sin stock/));
    fireEvent.click(screen.getAllByText('Ver cuáles')[0]);
    await waitFor(() => screen.getByLabelText('Buscar publicación'));
    assert.ok(screen.getByText('Espuma poliuretano'));
  } finally { cleanup(); }
});
