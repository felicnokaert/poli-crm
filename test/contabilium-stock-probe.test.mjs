import test from 'node:test';
import assert from 'node:assert/strict';
import { stockProbePaths } from '../lib/contabilium.mjs';

test('las rutas de prueba del stock por depósito llevan el id y solo leen (GET)', () => {
  const paths = stockProbePaths('123', 'PS-1');
  assert.ok(paths.includes('/api/conceptos/123'));
  assert.ok(paths.some((path) => path.includes('depositos')));
  assert.ok(paths.every((path) => path.startsWith('/api/')));
});
