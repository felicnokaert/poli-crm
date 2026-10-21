import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const { AssistantWindow } = await loadJsxModule('src/AssistantWindow.jsx');

const STANDARD = 'Hola AAA Para una pintada de protección se calculan 200 gramos x M2. En el caso de querer lograr un revestimiento epoxi de 1mm de espesor se calcula 1 kilo x M2. Saludos Brenda';
// Supabase falso: cada consulta encadenada termina devolviendo las filas de su tabla.
function fakeSupabase(tables = {}) {
  const chain = (rows) => {
    const query = { then: (resolve, reject) => Promise.resolve({ data: rows, count: 0, error: null }).then(resolve, reject) };
    for (const method of ['select', 'eq', 'neq', 'limit', 'order', 'insert', 'update', 'delete']) query[method] = () => query;
    return query;
  };
  return {
    from: (table) => chain(tables[table] || []),
    rpc: () => Promise.resolve({ data: [1, 2, 3].map((id) => ({ kind: 'pregunta', id: String(id), title: 'Resina epoxi', body: `Pregunta: cuanto rinde\nRespuesta: ${STANDARD}` })), error: null }),
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  };
}

test('muestra la respuesta del equipo arriba y se puede copiar', async () => {
  try {
    render(React.createElement(AssistantWindow, { supabase: fakeSupabase(), onClose: () => {} }));
    fireEvent.change(screen.getByLabelText('Preguntale al asistente'), { target: { value: 'cuanto rinde la epoxi' } });
    await waitFor(() => screen.getByText(/Así lo respondemos en Mercado Libre · 3 de 3/), { timeout: 3000 });
    assert.ok(screen.getByText(/se calcula 1 kilo x M2/));
    assert.ok(screen.getAllByText('Copiar').length >= 1);
  } finally { cleanup(); }
});
