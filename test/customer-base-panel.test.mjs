import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const ago = (days) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const ROWS = [
  { company: 'COMARG', tipo: 'FCA', fecha: ago(30), cliente: 'Carrocerías Norte S.A.', total: null, neto: '100.000,00' },
  { company: 'POLIPLAST', tipo: 'FCA', fecha: ago(100), cliente: 'CARROCERIAS NORTE', total: 50000, neto: null },
];
const fake = (rows) => {
  const make = (data) => { const b = { select: () => b, or: () => b, order: () => b, range: () => Promise.resolve({ data, error: null }), then: (ok) => ok({ data, error: null }) }; return b; };
  return { from: (table) => make(table === 'contabilium_comprobantes' ? rows : []) };
};

test('la ficha muestra estado, última compra, compras y razones sociales desde la facturación', async () => {
  const { CustomerBasePanel } = await loadJsxModule('src/CustomerBasePanel.jsx');
  const client = { id: 'c1', company: 'Carrocerías Norte S.A.', family: 'Carrozados' };
  render(React.createElement(CustomerBasePanel, { supabase: fake(ROWS), client, allClients: [client] }));
  await waitFor(() => assert.ok(screen.getByText('Activo')));
  assert.ok(screen.getByText(/Compras registradas:/));
  assert.match(screen.getByText(/Razones sociales en Contabilium/).textContent, /CARROCERIAS NORTE · Carrocerías Norte S\.A\. \(COMARG, POLIPLAST\)/);
  assert.match(screen.getByText(/Familia principal/).textContent, /Carrozados .*las facturas no traen productos/);
});

test('sin facturas que coincidan no inventa nada y sin cuenta en línea no muestra el panel', async () => {
  const { CustomerBasePanel } = await loadJsxModule('src/CustomerBasePanel.jsx');
  const client = { id: 'c9', company: 'Nadie' };
  const view = render(React.createElement(CustomerBasePanel, { supabase: fake(ROWS), client, allClients: [client] }));
  await waitFor(() => assert.ok(screen.getByText(/No encontré facturas con el nombre de esta empresa/)));
  view.unmount();
  const offline = render(React.createElement(CustomerBasePanel, { supabase: null, client, allClients: [client] }));
  assert.equal(offline.container.textContent, '');
});
