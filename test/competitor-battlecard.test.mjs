import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBattlecard } from '../src/competitor-battlecard.mjs';

test('la guía usa lo verificado, dice dónde nos cruzamos y no habla mal del competidor', () => {
  const card = buildBattlecard({ name: 'Satch Poliuretanos', kind: 'equipos', families: ['PURMAC', 'Poliurea', 'Inexistente'], summary: 'Fabrica máquinas.', caveats: 'Sin precios.' });
  assert.equal(card.known, 'Fabrica máquinas.');
  assert.equal(card.overlap.length, 2);
  assert.match(card.ask[0], /máquina/);
  assert.match(card.open, /Satch Poliuretanos/);
  assert.ok(card.unknown.includes('Sin precios.'));
  assert.ok(card.avoid.some((line) => /hables mal/.test(line)));
});

test('para no-equipos pregunta qué valoran del proveedor actual', () => {
  const card = buildBattlecard({ name: 'Fischer', kind: 'marca', families: ['Penosil'] });
  assert.match(card.ask[1], /valoran/);
  assert.equal(card.known, '');
});

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

test('Academia: elegir al competidor nombrado muestra su guía y oculta a los clientes', async () => {
  const { CompetitorTalk } = await loadJsxModule('src/Academy.jsx');
  const rows = [
    { id: 'satch', name: 'Satch Poliuretanos', kind: 'equipos', families: ['PURMAC'], summary: 'Fabrica máquinas.', caveats: '' },
    { id: 'cli', name: 'Poliuretanos del Norte', kind: 'cliente', families: [], summary: '', caveats: '' },
  ];
  const chain = { select: () => chain, order: () => chain, then: (resolve) => resolve({ data: rows, error: null }) };
  render(React.createElement(CompetitorTalk, { supabase: { from: () => chain } }));
  const select = await screen.findByLabelText('Competidor nombrado');
  assert.equal(select.querySelectorAll('option').length, 2, 'solo el placeholder y Satch');
  fireEvent.change(select, { target: { value: 'satch' } });
  assert.ok(await screen.findByText('Qué sabemos'));
  assert.ok(screen.getByText('Fabrica máquinas.'));
  cleanup();
});
