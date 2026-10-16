import test from 'node:test';
import assert from 'node:assert/strict';
import { globalSearch } from '../src/global-search.mjs';

const data = {
  clients: [{ id: 'c1', company: 'Corralón Sur', city: 'Rosario', phone: '341555' }, { id: 'c2', company: 'Pinturería Norte', city: 'Salta' }],
  tasks: [{ id: 't1', title: 'Llamar a Corralón Sur', done: false }, { id: 't2', title: 'Corralón vieja', done: true }],
  prospects: [{ id: 'p1', company: 'Corralón Oeste', city: 'Rosario' }],
};

test('encuentra empresas, tareas abiertas y prospectos', () => {
  const r = globalSearch('corralon', data);
  assert.deepEqual(r.map((x) => `${x.kind}:${x.id}`), ['empresa:c1', 'tarea:t1', 'prospecto:p1']);
});

test('todas las palabras tienen que aparecer, ignora acentos', () => {
  assert.deepEqual(globalSearch('corralón rosario', data).map((x) => x.id), ['c1', 'p1']);
  assert.deepEqual(globalSearch('corralon salta', data), []);
});

test('busca por teléfono y no devuelve nada sin palabras útiles', () => {
  assert.equal(globalSearch('341555', data)[0].id, 'c1');
  assert.deepEqual(globalSearch('  ', data), []);
});
