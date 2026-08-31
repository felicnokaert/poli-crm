import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate } from '../src/utils.mjs';

test('formats short dates and ISO timestamps without crashing', () => {
  assert.match(formatDate('2026-08-31'), /31/);
  assert.match(formatDate('2026-08-31T12:42:12.000Z'), /31/);
  assert.equal(formatDate(''), 'Sin fecha');
  assert.equal(formatDate('not-a-date'), 'Fecha inválida');
});
