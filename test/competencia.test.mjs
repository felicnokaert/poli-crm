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

test('cargar un competidor nuevo lo investiga en el momento y crea la ficha; si falla, abre la carga a mano', async () => {
  const { Competencia, newCompetitorLabel, hostOf } = await loadJsxModule('src/Competencia.jsx');
  assert.equal(hostOf('https://www.ejemplo.com.ar/x'), 'ejemplo.com.ar');
  assert.equal(newCompetitorLabel({ website: 'www.ejemplo.com.ar' }), 'ejemplo.com.ar');
  const inserts = [];
  const supa = fakeSupabase(inserts);
  supa.auth = { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) };
  const calls = [];
  const realFetch = globalThis.fetch;
  let answer = { ok: true, competitor: { name: 'Foam SA', kind: 'fabricante', families: ['Poliuretano'], summary: 'Según su sitio: "Espumas"', products: ['Poliuretano'], location: 'Rosario', website: 'https://foam.com.ar', channels: 'Tel. 341', sources: [{ t: 'Sitio oficial', u: 'https://foam.com.ar/' }], caveats: 'Ficha armada automáticamente.' } };
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return { json: async () => answer }; };
  try {
    render(React.createElement(Competencia, { supabase: supa, userEmail: 'V@x.com', families: ['Planchas', 'Poliuretano'] }));
    await screen.findByText('Argenpur S.A.');
    fireEvent.click(screen.getByRole('button', { name: /Cargar un competidor nuevo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Investigar y crear la ficha/ }));
    assert.equal(calls.length, 0, 'sin ningún dato no se investiga');
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Foam SA' } });
    fireEvent.change(screen.getByLabelText('Sitio web'), { target: { value: 'foam.com.ar' } });
    fireEvent.click(screen.getByRole('button', { name: /Investigar y crear la ficha/ }));
    await screen.findByText(/Listo: Foam SA/);
    assert.equal(calls[0].url, '/api/prospeccion');
    assert.deepEqual([calls[0].body.action, calls[0].body.name, calls[0].body.website], ['competitor', 'Foam SA', 'foam.com.ar']);
    assert.equal(calls[0].auth, 'Bearer tok');
    const saved = inserts.find((item) => item.table === 'competitors').row;
    assert.equal(saved.id, 'foam-sa');
    assert.equal(saved.reviewed, false);
    assert.equal(saved.location, 'Rosario');
    assert.equal(inserts.some((item) => item.table === 'prospect_requests'), false, 'ya no deja pedidos "en proceso"');
    // Si el sitio no se puede leer: aviso y carga a mano con lo que ya se sabe.
    answer = { ok: false, error: 'El sitio respondió 503.' };
    fireEvent.click(screen.getByRole('button', { name: /Cargar un competidor nuevo/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otra SRL' } });
    fireEvent.change(screen.getByLabelText('Sitio web'), { target: { value: 'otra.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Investigar y crear la ficha/ }));
    await screen.findByText(/El sitio respondió 503\. Te abrimos la carga a mano/);
    assert.equal(screen.getByLabelText('Nombre').value, 'Otra SRL');
    assert.equal(screen.getByLabelText('Sitio web').value, 'otra.com');
  } finally {
    globalThis.fetch = realFetch;
  }
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

test('un pedido sin procesar se puede cargar a mano y deja de figurar cuando existe la ficha', async () => {
  const { Competencia } = await loadJsxModule('src/Competencia.jsx');
  const reqs = [
    { id: 'r1', family: 'COMPETENCIA NUEVA: Tecno Ref', status: 'pendiente', scope: 'tecnoref.com.ar · instagram.com/tecnoref', notes: 'Poliuretano', created_at: '2026-10-16T12:00:00Z' },
    { id: 'r2', family: 'COMPETENCIA NUEVA: Argenpur S.A.', status: 'pendiente', scope: 'solo nombre', notes: '', created_at: '2026-10-16T12:00:00Z' },
  ];
  const log = [];
  const supa = {
    from(table) {
      const chain = {
        select: () => chain, order: () => chain, like: () => chain, eq: () => chain,
        then: (resolve) => resolve({ data: table === 'competitors' ? ROWS : reqs, error: null }),
        insert: async (row) => { log.push(row); return { error: null }; },
      };
      return chain;
    },
  };
  render(React.createElement(Competencia, { supabase: supa, userEmail: 'brenda@grupopoliplast.com.ar', families: ['Planchas', 'Poliuretano'] }));
  await screen.findByText('Tecno Ref');
  assert.equal(screen.queryByText('Argenpur S.A.', { selector: '.history-card strong' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Cargar a mano' }));
  assert.equal(screen.getByLabelText('Nombre').value, 'Tecno Ref');
  assert.equal(screen.getByLabelText('Sitio web').value, 'tecnoref.com.ar');
  assert.equal(screen.getByLabelText('Familia con la que compite').value, 'Poliuretano');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => assert.equal(log.length, 1));
  assert.equal(log[0].name, 'Tecno Ref');
  assert.deepEqual(log[0].families, ['Poliuretano']);
});
