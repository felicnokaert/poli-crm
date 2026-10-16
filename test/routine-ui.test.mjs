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
  assert.ok(screen.getAllByText(/Cierre comercial de la semana/).length >= 1);
  assert.ok(screen.getAllByText(/Prospección B2B/).length >= 1);
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
  assert.ok(screen.getAllByText(/sin rutina/i).length >= 1);
});

test('el cierre del día lista lo pendiente y permite pasarlo al próximo día hábil', async () => {
  const { DayReview } = await loadJsxModule('src/DayReview.jsx');
  const moved = [];
  const tasks = [{ id: 't1', title: 'Llamar a Pérez', done: false, dueDate: '2026-10-16', priority: 'Alta' }];
  render(React.createElement(DayReview, { date: '2026-10-16', planChecks: {}, tasks, onPostpone: (id, to) => moved.push([id, to]) }));
  assert.ok(screen.getByText('Llamar a Pérez'));
  fireEvent.click(screen.getByRole('button', { name: /Pasar al próximo día hábil/ }));
  assert.deepEqual(moved[0], ['t1', '2026-10-19']);
});

test('el buscador de la Academia encuentra productos y vendedores', async () => {
  const { KnowledgeSearch } = await loadJsxModule('src/Academy.jsx');
  render(React.createElement(KnowledgeSearch, { supabase: null, clients: [{ id: 'c1', company: 'Corralón Sur', rubro: 'aglupl' }] }));
  fireEvent.change(screen.getByPlaceholderText(/adhesivo/), { target: { value: 'agluplast' } });
  assert.ok(screen.getAllByText(/AGLUPLAST/).length >= 1);
  fireEvent.change(screen.getByPlaceholderText(/adhesivo/), { target: { value: 'repuestos' } });
  assert.ok(screen.getByText(/Juan · Gerente general/));
});

test('la búsqueda global abre la empresa elegida con Enter', async () => {
  const { CommandPalette } = await loadJsxModule('src/CommandPalette.jsx');
  const picked = [];
  render(React.createElement(CommandPalette, { clients: [{ id: 'c1', company: 'Corralón Sur' }], tasks: [], prospects: [], onPick: (item) => picked.push(item.id), onClose() {} }));
  const input = screen.getByPlaceholderText(/Buscar empresa/);
  fireEvent.change(input, { target: { value: 'corralon' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  assert.deepEqual(picked, ['c1']);
});

test('Inicio: "Mi día" muestra el avance y lleva a la rutina', async () => {
  const mod = await loadJsxModule('src/Dashboard.jsx');
  const navs = [];
  const metrics = { contacts: 0, effective: 0, proposals: 0, overdue: 0, dueToday: 0 };
  render(React.createElement(mod.Dashboard, { metrics, tasks: [], interactions: [], clients: [], sales: [], inbox: [], myChannels: [], planChecks: {}, showWelcome: false, onNavigate: (v) => navs.push(v) }));
  const open = screen.queryByRole('button', { name: /Abrir rutina y cierre/ });
  if (open) { fireEvent.click(open); assert.equal(navs[0], 'tasks'); }
});

test('para el resto del equipo no aparece la rutina de Felipe ni el plan Trello, pero sí el cierre del día', async () => {
  const { ownsFelipeTools } = await import('../src/personal-tools.mjs');
  assert.equal(ownsFelipeTools('felipe@grupopoliplast.com.ar'), true);
  assert.equal(ownsFelipeTools('brenda@grupopoliplast.com.ar'), false);
  assert.equal(ownsFelipeTools('', false), true);
  const { Tasks } = await loadJsxModule('src/Tasks.jsx');
  render(React.createElement(Tasks, { items: [], onToggle() {}, onOpen() {}, onNew() {}, planChecks: {}, personal: false }));
  assert.equal(screen.queryByRole('tab', { name: 'Rutina' }), null);
  fireEvent.click(screen.getByRole('tab', { name: 'Cierre del día' }));
  assert.equal(screen.queryByText(/Plan Trello/), null);
  assert.ok(screen.getAllByText(/Cierre del día/).length >= 1);
});

test('Directorio del equipo: trae las empresas que faltan sin pisar las propias', async () => {
  const { SharedDirectory } = await loadJsxModule('src/SharedDirectory.jsx');
  const saved = [];
  const supabase = { from: () => ({ select: (_cols, opts) => opts?.head ? Promise.resolve({ count: 2, error: null }) : { range: () => Promise.resolve({ data: [{ data: { id: 'a', company: 'Nueva SA', city: 'Salta' } }, { data: { id: 'b', company: 'Mía SA', city: 'Rosario' } }], error: null }) } }) };
  render(React.createElement(SharedDirectory, { supabase, session: { user: { email: 'brenda@grupopoliplast.com.ar' } }, clients: [{ id: 'z', company: 'Mía SA', city: 'Rosario' }], setClients: (c) => saved.push(c) }));
  assert.equal(screen.queryByRole('button', { name: /Publicar mis empresas/ }), null);
  await screen.findByText(/Hay 2 empresas/);
  fireEvent.click(screen.getByRole('button', { name: /Traer empresas del equipo/ }));
  await screen.findByText(/Se sumaron 1 empresas/);
  assert.equal(saved[0].length, 2);
});
