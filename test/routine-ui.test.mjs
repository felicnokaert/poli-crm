import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

test('la Rutina muestra los bloques del día, se tilda y lleva a la pantalla del bloque', async () => {
  const { Routine } = await loadJsxModule('src/Routine.jsx');
  const toggles = [];
  const navs = [];
  render(React.createElement(Routine, { date: '2026-10-16', planChecks: {}, onToggle: (key, value) => toggles.push([key, value]), onNavigate: (view) => navs.push(view) }));
  assert.ok(screen.getByText(/Cierre comercial de la semana/));
  assert.ok(screen.getByText(/Prospección B2B/));
  fireEvent.click(screen.getByLabelText('Marcar Prospección B2B'));
  assert.deepEqual(toggles[0], ['rutina:2026-10-16:prospeccion', true]);
  fireEvent.click(screen.getAllByRole('button', { name: /Ir/ })[1]);
  assert.equal(navs[0], 'prospecting');
  fireEvent.click(screen.getByRole('button', { name: /Base/ }));
  assert.equal(screen.queryByText(/Orden de datos/), null, 'la versión base oculta los extra');
});

test('fin de semana: sin rutina', async () => {
  const { Routine } = await loadJsxModule('src/Routine.jsx');
  render(React.createElement(Routine, { date: '2026-10-17', planChecks: {}, onToggle() {}, onNavigate() {} }));
  assert.ok(screen.getByText(/sin rutina/i));
});
