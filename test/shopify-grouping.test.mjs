import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupProposals, parseTitle, proposalsCsv } from '../src/shopify-grouping.mjs';

test('parseTitle separa tamaño, pack, tapa, línea y color del nombre base', () => {
  assert.deepEqual(parseTitle('BALDE PLASTICO ECONOMICO SIN TAPA 20L X5'), { base: 'balde plastico', attrs: { Capacidad: '20 L', Pack: 'x5', Tapa: 'Sin tapa', 'Línea': 'Económico' } });
  assert.deepEqual(parseTitle('Resina epoxi cristal 1,5 kg'), { base: 'resina epoxi', attrs: { Peso: '1,5 kg', Color: 'Cristal' } });
  // "x 10 kg" es un peso, no un pack.
  assert.equal(parseTitle('Pegamento x 10 kg').attrs.Pack, undefined);
  assert.equal(parseTitle('BALDE PLASTICO NEGRO 10L').attrs.Color, 'Negro');
});

const product = (id, title, over = {}) => ({ id, title, status: 'ACTIVE', product_type: 'Baldes y botellas', total_inventory: 100, ...over });
const colors = (id, list) => list.map((color, index) => ({ id: `${id}-${index}`, product_id: id, title: color, sku: `${id}-${index}`, price: 1000, inventory_quantity: 10, options: [{ name: 'color', value: color }] }));

test('parseTitle: medidas juntas, aplicación, cuerpo y talle', () => {
  assert.equal(parseTitle('Cinta Cortina Pvc Cristal 100mm x 1,5mm x 50m').attrs.Medida, '100 mm x 1,5 mm x 50 m');
  assert.equal(parseTitle('Cinta Cortina Pvc Cristal 100mm x 1,5mm x 50m').attrs.Pack, undefined);
  assert.deepEqual(parseTitle('Espuma Multiuso PU-46 - Pistola'), { base: 'espuma multiuso pu 46', attrs: { 'Aplicación': 'Pistola' } });
  assert.equal(parseTitle('Máquina P/ Pintar Airless Pm-595 Cuerpo alto').attrs.Cuerpo, 'Alto');
  assert.equal(parseTitle('Máscara Cara Completa 3M 6800 Reutilizable Talle M').attrs.Talle, 'M');
});

test('baldes: 6 productos del mismo balde se proponen como UNO con Capacidad, Pack y Color (3 opciones)', () => {
  const products = [product('a', 'BALDE PLASTICO 10L'), product('b', 'BALDE PLASTICO 10L X5', { status: 'UNLISTED' }), product('c', 'BALDE PLASTICO 20L'), product('d', 'BALDE PLASTICO 20L X5'), product('e', 'Resina epoxi 1 kg', { product_type: 'Resinas' })];
  const variants = [...colors('a', ['Rojo', 'Azul']), ...colors('b', ['Rojo', 'Azul']), ...colors('c', ['Rojo', 'Azul']), ...colors('d', ['Rojo', 'Azul']), ...colors('e', ['x'])];
  const proposals = groupProposals(products, variants);
  assert.equal(proposals.length, 1);
  const [balde] = proposals;
  assert.equal(balde.products.length, 4);
  assert.deepEqual(balde.options.map((option) => option.name), ['Capacidad', 'Pack', 'Color']);
  assert.deepEqual(balde.options[0].values, ['10 L', '20 L']);
  assert.deepEqual(balde.options[1].values, ['x1', 'x5']);
  assert.equal(balde.variants.length, 8);
  assert.equal(balde.survivor.id, 'a'); // el activo con más stock
  assert.deepEqual(balde.warnings, []);
});

test('más de 3 opciones: las últimas se juntan en "Modelo" y se avisa', () => {
  const products = [product('a', 'BALDE PLASTICO 10L'), product('b', 'BALDE PLASTICO SIN TAPA 20L X5'), product('c', 'BALDE PLASTICO ECONOMICO 20L X3')];
  const variants = [...colors('a', ['Rojo']), ...colors('b', ['Azul']), ...colors('c', ['Negro'])];
  const [proposal] = groupProposals(products, variants);
  assert.equal(proposal.options.length, 3);
  assert.equal(proposal.options[2].name, 'Modelo');
  assert.match(proposal.warnings[0], /Shopify admite 3/);
});

test('productos distintos o archivados no se agrupan; variantes repetidas se avisan', () => {
  assert.equal(groupProposals([product('a', 'Resina epoxi 1 kg', { product_type: 'R' }), product('b', 'Pigmento rojo', { product_type: 'R' })], []).length, 0);
  assert.equal(groupProposals([product('a', 'Balde 10L'), product('b', 'Balde 20L', { status: 'ARCHIVED' })], []).length, 0);
  const dup = groupProposals([product('a', 'Balde 10L'), product('b', 'BALDE 10L', { status: 'DRAFT' }), product('c', 'Balde 20L')], []);
  assert.match(dup[0].warnings.join(' '), /quedarían iguales/);
});

test('el CSV trae una fila por variante propuesta', () => {
  const [proposal] = groupProposals([product('a', 'Balde 10L'), product('b', 'Balde 20L')], colors('a', ['Rojo']).concat(colors('b', ['Rojo'])));
  const csv = proposalsCsv([proposal]);
  assert.ok(csv.startsWith('﻿"Producto propuesto"'));
  assert.equal(csv.split('\n').length, 3);
  assert.match(csv, /Capacidad: 10 L/);
});
