import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const ago = (days) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

const ROWS = [
  { company: 'COMARG', tipo: 'FCA', fecha: ago(200), cliente: 'Carrocerías Norte S.A.', total: null, neto: '100.000,00' },
  { company: 'COMARG', tipo: 'FCA', fecha: ago(260), cliente: 'Carrocerías Norte S.A.', total: null, neto: '120.000,00' },
  { company: 'COMARG', tipo: 'FCA', fecha: ago(320), cliente: 'Carrocerías Norte S.A.', total: null, neto: '110.000,00' },
  { company: 'COMARG', tipo: 'COT', fecha: ago(10), cliente: 'Frío Sur SRL', total: null, neto: '8.000,00' },
];

// Imita la cadena de PostgREST que usa la cola: from().select().or().order().range() y from().select().
function fakeSupabase() {
  const result = (data) => ({ data, error: null });
  const chain = (data) => {
    const builder = { select: () => builder, or: () => builder, not: () => builder, order: () => builder, range: () => Promise.resolve(result(data)), then: (resolve) => resolve(result(data)) };
    return builder;
  };
  return { from: (table) => chain(table === 'contabilium_comprobantes' ? ROWS : [{ company: 'COMARG', history_done: false, cursor_date: '2025-03-01' }]) };
}

describe('Cola del día', () => {
  async function mount(initial) {
    const mod = await loadJsxModule('src/Prospeccion.jsx');
    const snapshots = [];
    function Wrapper() {
      const [state, setState] = React.useState(initial);
      const setData = (next) => setState((previous) => {
        const value = typeof next === 'function' ? next(previous) : next;
        snapshots.push(value);
        return value;
      });
      return React.createElement(mod.Prospeccion, { provinces: {}, data: state, setData, userEmail: 'marketing@grupopoliplast.com.ar', onOpenClient: () => {}, supabase: fakeSupabase() });
    }
    render(React.createElement(Wrapper));
    return snapshots;
  }

  const clients = [
    { id: 'c1', company: 'Carrocerías Norte S.A.', contact: 'marta gómez', phone: '+54 9 343 4000000' },
    { id: 'c2', company: 'Frío Sur SRL' },
  ];
  const prospects = [
    { id: 'p1', company: 'Ferretería Sur', family: 'Penosil', rubro: 'ferretería', city: 'Paraná', phone: '0343 4231234', state: 'No contactado', zone: 'A', fitLevel: 'Alto', sheetScore: 85, source: 'importado', createdAt: '2026-10-01' },
  ];

  test('entra por la cola del día y muestra las tres listas con su cantidad', async () => {
    await mount({ clients, prospects });
    await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Reactivar (1)' })));
    assert.ok(screen.getByRole('tab', { name: 'Cotizaron y no compraron (1)' }));
    assert.ok(screen.getByRole('tab', { name: 'Prospectos nuevos (1)' }));
    assert.ok(screen.getByText(/Todavía se está copiando el historial de COMARG/));
  });

  test('Reactivar: muestra el mensaje listo y el resultado en un toque lo saca de la lista y queda anotado', async () => {
    const snapshots = await mount({ clients, prospects });
    await waitFor(() => assert.ok(screen.getByText('Carrocerías Norte S.A.')));
    const message = screen.getByLabelText('Mensaje para Carrocerías Norte S.A.');
    assert.match(message.value, /Hola Marta/);
    assert.match(message.value, /trabajaron con nosotros/);
    fireEvent.click(screen.getByRole('button', { name: 'Precio' }));
    await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Reactivar (0)' })));
    const last = snapshots.at(-1).clients.find((client) => client.id === 'c1');
    assert.equal(last.contactLog.length, 1);
    assert.equal(last.contactLog[0].queue, 'reactivar');
    assert.equal(last.contactLog[0].outcome, 'Precio');
    assert.equal(last.contactLog[0].user, 'marketing@grupopoliplast.com.ar');
  });

  test('Cotizaron y no compraron: mensaje con la fecha de la cotización', async () => {
    await mount({ clients, prospects });
    await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Cotizaron y no compraron (1)' })));
    fireEvent.click(screen.getByRole('tab', { name: 'Cotizaron y no compraron (1)' }));
    const message = screen.getByLabelText('Mensaje para Frío Sur SRL');
    assert.match(message.value, /cotización que te pasamos el/);
  });

  test('Prospectos nuevos: un rechazo en un toque queda en el historial y no crea tarea', async () => {
    const snapshots = await mount({ clients, prospects, tasks: [] });
    await waitFor(() => assert.ok(screen.getByRole('tab', { name: 'Prospectos nuevos (1)' })));
    fireEvent.click(screen.getByRole('tab', { name: 'Prospectos nuevos (1)' }));
    assert.match(screen.getByText(/Zona A · Encaje Alto · Puntaje 85/).textContent, /mensaje versión [AB]/);
    assert.match(screen.getByLabelText('Mensaje para Ferretería Sur').value, /EasySpray/);
    fireEvent.click(screen.getByRole('button', { name: 'Dólar' }));
    const state = snapshots.at(-1);
    assert.equal(state.prospects[0].state, 'Sin interés');
    assert.equal(state.prospects[0].outcome, 'Dólar');
    assert.equal(state.prospects[0].history[0].outcome, 'Dólar');
    assert.equal((state.tasks || []).length, 0, 'un rechazo no crea tarea');
  });
});
