import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalFamily, FAMILIES } from '../src/families.mjs';

test('canonicalFamily normaliza una familia en mayusculas a su forma en FAMILIES', () => {
  assert.equal(canonicalFamily('CARROZADOS'), 'Carrozados');
  assert.equal(canonicalFamily('resinplast'), 'Resinplast');
});

test('canonicalFamily mapea la variante plural "POLIURETANOS" a "Poliuretano"', () => {
  assert.equal(canonicalFamily('POLIURETANOS'), 'Poliuretano');
  assert.equal(canonicalFamily('Poliuretanos'), 'Poliuretano');
});

test('canonicalFamily deja pasar un valor ya canonico sin cambios', () => {
  for (const family of FAMILIES) assert.equal(canonicalFamily(family), family);
});

test('canonicalFamily devuelve el valor original si no reconoce ninguna variante', () => {
  assert.equal(canonicalFamily('Algo Raro Sin Mapear'), 'Algo Raro Sin Mapear');
});

test('canonicalFamily es un no-op para valores vacios', () => {
  assert.equal(canonicalFamily(''), '');
  assert.equal(canonicalFamily(undefined), undefined);
});
