import test from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow, paginate } from '../src/pager.mjs';

test('paginate corta la lista y corrige páginas fuera de rango', () => {
  const list = Array.from({ length: 53 }, (_, i) => i);
  assert.deepEqual(paginate(list, 1, 25).rows.length, 25);
  const last = paginate(list, 3, 25);
  assert.deepEqual([last.from, last.to, last.pages, last.rows.length], [51, 53, 3, 3]);
  assert.equal(paginate(list, 99, 25).page, 3);
  assert.deepEqual(paginate([], 1, 25), { rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
});

test('los números de página muestran los extremos y alrededor de la actual', () => {
  assert.deepEqual(pageWindow(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(1, 20), [1, 2, 3, '…', 20]);
  assert.deepEqual(pageWindow(10, 20), [1, '…', 8, 9, 10, 11, 12, '…', 20]);
  assert.deepEqual(pageWindow(20, 20), [1, '…', 18, 19, 20]);
});
