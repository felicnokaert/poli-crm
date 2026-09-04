import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBoardCsv } from '../src/board-csv.mjs';

test('maps common Spanish header names to card fields', () => {
  const csv = 'Titulo;Etiqueta;Descripcion;Fecha\nSubir catálogo;Shopify;Cargar 20 productos;15/09/2026\n';
  const { cards } = parseBoardCsv(csv);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    title: 'Subir catálogo',
    tag: 'Shopify',
    description: 'Cargar 20 productos',
    dueDate: '2026-09-15',
  });
});

test('falls back to the first non-empty column when there is no title header', () => {
  const csv = 'Columna A;Columna B\nHacer el catálogo;algo\n';
  const { cards } = parseBoardCsv(csv);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, 'Hacer el catálogo');
});

test('skips rows without a usable title', () => {
  const csv = 'Titulo\nTarea real\n\n   \n';
  const { cards } = parseBoardCsv(csv);
  assert.equal(cards.length, 1);
});

test('returns an empty result for a file with only a header', () => {
  const csv = 'Titulo;Etiqueta\n';
  const { cards } = parseBoardCsv(csv);
  assert.deepEqual(cards, []);
});
