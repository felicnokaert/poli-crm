import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';
import { buildNotifications } from '../src/notifications.mjs';

afterEach(cleanup);

test('Sin mail: lista la cartera sin mail y guarda el que se carga', async () => {
  const { ClientEmails, MissingEmailNotice } = await loadJsxModule('src/ClientEmails.jsx');
  const saved = [];
  render(React.createElement(ClientEmails, { clients: [{ id: 'a', company: 'Foo SRL' }, { id: 'b', company: 'Bar', email: 'bar@bar.com' }], onSaveEmail: (id, mail) => saved.push([id, mail]) }));
  assert.ok(screen.getByText('Foo SRL'));
  assert.equal(screen.queryByText('Bar'), null);
  fireEvent.change(screen.getByLabelText('Mail de Foo SRL'), { target: { value: 'Compras@Foo.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  assert.deepEqual(saved, [['a', 'compras@foo.com']]);
  cleanup();
  const updated = [];
  render(React.createElement(MissingEmailNotice, { client: { id: 'a', company: 'Foo' }, onSave: (client) => updated.push(client) }));
  fireEvent.change(screen.getByLabelText('Mail del cliente'), { target: { value: 'ana@foo.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar mail' }));
  assert.equal(updated[0].email, 'ana@foo.com');
});

test('campanita: un aviso por semana con los clientes sin mail', () => {
  const items = buildNotifications({ noEmail: 3, today: '2026-11-27' });
  assert.equal(items[0].id, 'noemail:2026-11-23');
  assert.equal(items[0].clientsTab, 'sinmail');
  assert.equal(buildNotifications({ noEmail: 0, today: '2026-11-27' }).length, 0);
});
