import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

function fakeApi(calls) {
  return {
    async load() {
      return {
        members: [{ id: 'm1', name: 'Juan', email: 'juan@x.com', role: 'vendedor', active: true }, { id: 'm2', name: 'Ezequiel', email: null, role: 'vendedor', active: true }],
        rules: [{ id: 'r1', kind: 'canal', value: 'juan', member_id: 'm1' }],
        assignments: [],
        events: [
          { channel: 'juan', direction: 'inbound', customer_wa_id: '549222', customer_name: 'Ana Gómez', text_body: 'Hola, ¿cuánto sale el kit?', occurred_at: new Date().toISOString() },
          { channel: 'general', direction: 'inbound', customer_wa_id: '549333', customer_name: 'Luis', text_body: 'Necesito fibra', occurred_at: new Date().toISOString() },
        ],
        statusEvents: [],
      };
    },
    async assign(conv, patch) { calls.push(['assign', conv.key, patch]); },
    async addMember(member) { calls.push(['addMember', member]); },
    async updateMember() {}, async addRule() {}, async removeRule() {},
  };
}

test('la bandeja lista las conversaciones, cuenta por persona y permite asignar y copiar la respuesta', async () => {
  const { TeamInbox } = await loadJsxModule('src/TeamInbox.jsx');
  const calls = [];
  let copied = '';
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } }, configurable: true });
  render(React.createElement(TeamInbox, { api: fakeApi(calls), userEmail: 'juan@x.com', isAdmin: false }));
  await screen.findByText('Ana Gómez');
  assert.ok(screen.getByText('Luis'));
  assert.ok(screen.getByRole('button', { name: /Sin asignar/ }), 'chip de sin asignar');
  fireEvent.change(screen.getByLabelText('Asignar Luis'), { target: { value: 'm2' } });
  await waitFor(() => assert.equal(calls.length, 1));
  assert.deepEqual(calls[0], ['assign', 'general|549333', { member_id: 'm2' }]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Respuesta sugerida' })[0]);
  fireEvent.click(await screen.findByRole('button', { name: /Copiar respuesta/ }));
  await waitFor(() => assert.match(copied, /Juan, Grupo Poliplast/));
  assert.equal(screen.queryByText('Equipo y reglas'), null, 'un vendedor no edita el equipo');
});

test('el administrador ve el panel de equipo y reglas', async () => {
  const { TeamInbox } = await loadJsxModule('src/TeamInbox.jsx');
  render(React.createElement(TeamInbox, { api: fakeApi([]), userEmail: 'felipe@grupopoliplast.com.ar', isAdmin: true }));
  await screen.findByText('Ana Gómez');
  fireEvent.click(screen.getByRole('button', { name: 'Equipo y reglas' }));
  assert.ok(screen.getByLabelText('Nombre nuevo'));
  assert.ok(screen.getByText(/Canal:/));
});

test('sin conexión a la base avisa que está disponible en línea', async () => {
  const { TeamInbox } = await loadJsxModule('src/TeamInbox.jsx');
  render(React.createElement(TeamInbox, { api: null, userEmail: 'a@b.c', isAdmin: false }));
  assert.ok(await screen.findByText(/versión en línea/));
});
