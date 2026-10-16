import test from 'node:test';
import assert from 'node:assert/strict';
import { coverage, needsSheet, productKeys, sheetPathFor, sheetsFor } from '../src/product-coverage.mjs';

const products = [
  { id: 'p1', name: 'Poliol isoBUNKER 618 SP', family: 'Poliuretano', subfamily: 'Rígido' },
  { id: 'p2', name: 'Espuma PU-476 Ignífuga', family: 'PENOSIL', subfamily: 'Espumas' },
  { id: 'p3', name: 'Polymer MS-35 Pega y sella', family: 'PENOSIL', subfamily: 'Selladores' },
  { id: 'p4', name: 'Almohada viscoelástica clásica', family: 'Almohadas', subfamily: 'Viscoelásticas' },
  { id: 'p5', name: 'Balde plástico 20L', family: 'Baldes', subfamily: '' },
  { id: 'p6', name: 'Poxiplast 450GR', family: 'RESINPLAST', subfamily: 'Adhesivos' },
];
const docs = [
  { id: 'd1', title: 'PDS isoBUNKER 618-SP', sourceFile: 'PRODUCTOS/POLIURETANOS/Ficha 618 SP/PDS isoBUNKER 618-SP.pdf' },
  { id: 'd2', title: 'Ficha general adhesivos epoxi' },
];
const links = [{ document_id: 'd2', scope_type: 'product', product_id: 'p6' }];

test('no todos llevan ficha: almohadas y baldes no; químicos sí', () => {
  assert.equal(needsSheet(products[3]), false);
  assert.equal(needsSheet(products[4]), false);
  assert.equal(needsSheet(products[0]), true);
  assert.equal(needsSheet(products[1]), true);
});

test('reconoce el producto por su código, no por palabras genéricas', () => {
  assert.deepEqual(productKeys(products[0]).codes, ['618']);
  assert.deepEqual(productKeys(products[5]).codes, [], '450GR es un tamaño, no un código');
  assert.deepEqual(productKeys(products[1]).codes, ['476']);
});

test('encuentra la ficha por código o por vínculo hecho a mano', () => {
  assert.deepEqual(sheetsFor(products[0], docs, links).map((doc) => doc.id), ['d1']);
  assert.deepEqual(sheetsFor(products[5], docs, links).map((doc) => doc.id), ['d2']);
  assert.deepEqual(sheetsFor(products[1], docs, links), []);
});

test('resumen por familia: con ficha, faltan y no la necesitan', () => {
  const { totals, families } = coverage(products, docs, links);
  assert.deepEqual(totals, { withSheet: 2, missing: 2, notNeeded: 2 });
  assert.equal(families[0].family, 'PENOSIL', 'primero la familia con más faltantes');
  assert.deepEqual(families[0].missing.map((p) => p.id), ['p2', 'p3']);
});

test('la ficha subida desde un producto se guarda en FICHAS / familia / producto', () => {
  assert.equal(sheetPathFor(products[2], 'tds.pdf'), 'FICHAS/PENOSIL/Polymer MS-35 Pega y sella/tds.pdf');
});
