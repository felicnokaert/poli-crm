import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

const ROWS = [{ id: 'argenpur', name: 'Argenpur S.A.', kind: 'fabricante', families: ['Planchas'], summary: 'Fabricante de poliuretano.', products: ['Bloques'], location: 'Paso del Rey', website: 'https://www.argenpur.com.ar/', channels: 'Directa', sources: [{ t: 'Sitio oficial', u: 'https://www.argenpur.com.ar/' }], caveats: 'Sin precios.' }];

function fakeSupabase(inserts) {
  return {
    from(table) {
      const chain = {
        select: () => chain, order: () => chain, like: () => chain,
        then: (resolve) => resolve({ data: table === 'competitors' ? ROWS : [], error: null }),
        insert: async (row) => { inserts.push({ table, row }); return { error: null }; },
      };
      return chain;
    },
  };
}

test('arma el pedido con nombre, sitio y exige no inventar', async () => {
  const { buildCompetitorPrompt } = await loadJsxModule('src/Competencia.jsx');
  const prompt = buildCompetitorPrompt(ROWS[0]);
  assert.match(prompt, /Argenpur S\.A\./);
  assert.match(prompt, /argenpur\.com\.ar/);
  assert.match(prompt, /no verificado/);
});

test('muestra la ficha con fuentes y pide la profundización a Claude', async () => {
  const { Competencia } = await loadJsxModule('src/Competencia.jsx');
  const inserts = [];
  render(React.createElement(Competencia, { supabase: fakeSupabase(inserts), userEmail: 'Felipe@x.com', families: ['Planchas', 'Penosil'] }));
  await screen.findByText('Argenpur S.A.');
  assert.ok(screen.getByText('Sitio oficial'));
  assert.ok(screen.getByText(/Sin precios/));
  fireEvent.click(screen.getByRole('button', { name: /Pedir al equipo/ }));
  await waitFor(() => assert.equal(inserts.length, 1));
  assert.equal(inserts[0].table, 'prospect_requests');
  assert.equal(inserts[0].row.family, 'COMPETENCIA: Argenpur S.A.');
  assert.equal(inserts[0].row.user_email, 'felipe@x.com');
});

test('filtra por familia y oculta las familias sin competidores', async () => {
  const { Competencia, filterCompetitors } = await loadJsxModule('src/Competencia.jsx');
  const rows = [{ id: 'a', families: ['Planchas'] }, { id: 'b', families: ['Penosil'] }, { id: 'c', families: ['Planchas', 'Penosil'] }];
  assert.equal(filterCompetitors(rows, 'Planchas').length, 2);
  assert.equal(filterCompetitors(rows, 'Todas').length, 3);
  render(React.createElement(Competencia, { supabase: fakeSupabase([]), userEmail: 'a@b.c', families: ['Planchas', 'Penosil', 'Poliurea'] }));
  await screen.findByText('Argenpur S.A.');
  assert.ok(screen.getByRole('button', { name: 'Planchas' }));
  assert.equal(screen.queryByRole('button', { name: 'Penosil' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Poliurea' }), null);
});

test('cargar un competidor nuevo deja un pedido en la cola con los links', async () => {
  const { Competencia, buildNewCompetitorPrompt, newCompetitorLabel, hostOf } = await loadJsxModule('src/Competencia.jsx');
  assert.equal(hostOf('https://www.ejemplo.com.ar/x'), 'ejemplo.com.ar');
  assert.equal(newCompetitorLabel({ website: 'www.ejemplo.com.ar' }), 'ejemplo.com.ar');
  assert.match(buildNewCompetitorPrompt({ name: 'Foam SA', instagram: '@foamsa' }), /Instagram: @foamsa/);
  const inserts = [];
  render(React.createElement(Competencia, { supabase: fakeSupabase(inserts), userEmail: 'V@x.com', families: ['Planchas'] }));
  await screen.findByText('Argenpur S.A.');
  fireEvent.click(screen.getByRole('button', { name: /Cargar un competidor nuevo/ }));
  fireEvent.click(screen.getByRole('button', { name: /Cargar y que la IA investigue/ }));
  assert.equal(inserts.length, 0, 'sin ningún dato no se envía');
  fireEvent.change(screen.getByLabelText('Instagram'), { target: { value: '@foamsa' } });
  fireEvent.click(screen.getByRole('button', { name: /Cargar y que la IA investigue/ }));
  await waitFor(() => assert.equal(inserts.length, 1));
  assert.match(inserts[0].row.family, /^COMPETENCIA NUEVA: /);
  assert.equal(inserts[0].row.user_email, 'v@x.com');
});

// Base que registra todo y puede negar el update (como si la tabla no tuviera permiso de edición).
function recordingSupabase(log, { updateAllowed }) {
  return {
    from(table) {
      const chain = {
        select: () => chain, order: () => chain, like: () => chain, eq: () => chain,
        then: (resolve) => resolve({ data: table === 'competitors' ? ROWS : [], error: null }),
        insert: async (row) => { log.push(['insert', row]); return { error: null }; },
        update: (patch) => { log.push(['update', patch]); return { eq: () => ({ select: async () => ({ data: updateAllowed ? [{ id: 'x' }] : [], error: null }) }) }; },
        delete: () => ({ eq: async (_col, id) => { log.push(['delete', id]); return { error: null }; } }),
      };
      return chain;
    },
  };
}

test('Felipe cambia las familias de un competidor; si la base no deja editar, reemplaza la ficha', async () => {
  const { Competencia } = await loadJsxModule('src/Competencia.jsx');
  for (const updateAllowed of [true, false]) {
    const log = [];
    render(React.createElement(Competencia, { supabase: recordingSupabase(log, { updateAllowed }), userEmail: 'felipe@grupopoliplast.com.ar', families: ['Planchas', 'Poliuretano'] }));
    await screen.findByText('Argenpur S.A.');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar familias' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Planchas' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Poliuretano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar familias' }));
    await screen.findByText(/Argenpur S\.A\.: Poliuretano\./);
    assert.deepEqual(log[0], ['update', { families: ['Poliuretano'] }]);
    if (updateAllowed) assert.equal(log.length, 1);
    else {
      assert.deepEqual(log[1], ['delete', 'argenpur']);
      assert.equal(log[2][0], 'insert');
      assert.deepEqual(log[2][1].families, ['Poliuretano']);
      assert.equal(log[2][1].summary, ROWS[0].summary);
    }
    cleanup();
  }
});

test('el resto del equipo no ve "Cambiar familias"; pegar varios carga solo los nuevos', async () => {
  const { Competencia } = await loadJsxModule('src/Competencia.jsx');
  const log = [];
  render(React.createElement(Competencia, { supabase: recordingSupabase(log, { updateAllowed: true }), userEmail: 'brenda@grupopoliplast.com.ar', families: ['Poliuretano'] }));
  await screen.findByText('Argenpur S.A.');
  assert.equal(screen.queryByRole('button', { name: 'Cambiar familias' }), null);
  fireEvent.click(screen.getByRole('button', { name: '+ Pegar varios' }));
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Alkanos\nFana/ Kilcom\nArgenpur S.A.\nalkanos' } });
  fireEvent.change(screen.getByLabelText('Familia con la que compiten'), { target: { value: 'Poliuretano' } });
  fireEvent.click(screen.getByRole('button', { name: /^Guardar/ }));
  await screen.findByText(/Cargados 2 competidores/);
  const rows = log[0][1];
  assert.deepEqual(rows.map((r) => r.name), ['Alkanos', 'Fana / Kilcom']);
  assert.ok(rows.every((r) => r.families[0] === 'Poliuretano' && r.reviewed === false));
});
