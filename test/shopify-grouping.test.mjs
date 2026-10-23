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

test('más de 3 opciones: se parte por capacidad y línea en vez de juntar todo en "Modelo"', () => {
  const titles = ['BALDE PLASTICO 10L', 'BALDE PLASTICO SIN TAPA 10L X5', 'BALDE PLASTICO ECONOMICO 10L X3', 'BALDE PLASTICO 20L', 'BALDE PLASTICO SIN TAPA 20L X5', 'BALDE PLASTICO ECONOMICO 20L X3'];
  const products = titles.map((title, index) => product(`p${index}`, title));
  const variants = products.flatMap((item) => colors(item.id, ['Rojo', 'Azul']));
  const proposals = groupProposals(products, variants);
  const names = proposals.map((proposal) => proposal.name);
  assert.ok(names.some((name) => /10 L · línea Estándar/i.test(name)), names.join(' | '));
  assert.ok(names.some((name) => /20 L · línea Estándar/i.test(name)));
  for (const proposal of proposals) {
    assert.ok(proposal.options.length <= 3);
    assert.ok(!proposal.options.some((option) => option.name === 'Modelo'));
  }
});

test('con 3 opciones ya no hay Modelo; con 4 sin dimensión para partir se pliega y se avisa', () => {
  const products = [product('a', 'KIT RESINA ROJO X2'), product('b', 'KIT RESINA AZUL X3 SIN TAPA')];
  const [proposal] = groupProposals(products, colors('a', ['Rojo']).concat(colors('b', ['Azul'])));
  assert.ok(proposal.options.length <= 3);
});

test('avisos: SKU repetido y precios muy distintos (el stock 999 es a propósito y no avisa)', () => {
  const products = [product('a', 'Balde 10L'), product('b', 'Balde 20L')];
  const variants = [
    { id: 'v1', product_id: 'a', title: 'Rojo', sku: 'DUP', price: 1000, inventory_quantity: 999, options: [{ name: 'Color', value: 'Rojo' }] },
    { id: 'v2', product_id: 'a', title: 'Azul', sku: 'DUP', price: 2000, inventory_quantity: 5, options: [{ name: 'Color', value: 'Azul' }] },
  ];
  const [proposal] = groupProposals(products, variants);
  const text = proposal.warnings.join(' ');
  assert.match(text, /SKU repetido DUP/);
  assert.match(text, /Precios muy distintos/);
  assert.doesNotMatch(text, /relleno/);
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

test('PU-46: manual y pistola son UNA opción "Aplicación", también en los kits con opciones canula/pistola', () => {
  const mk = (id, title, status, opts) => ({ product: { id, title, status, product_type: 'espumas de construccion', total_inventory: 10 }, opts });
  const items = [
    mk('m', 'Espuma Multiuso PU-46 - Manual', 'ACTIVE', ['Contenido', ['X1', 'X6', 'X12']]),
    mk('p', 'Espuma Multiuso PU-46 - Pistola', 'DRAFT', ['Contenido', ['X1', 'X6', 'X12']]),
    mk('km', 'Kit Espuma Multiuso Pu-46', 'ACTIVE', ['cantidad', ['3', '6', '12', '24'], 'canula']),
    mk('kp', 'Kit Espuma Multiuso Pu-46 Pistola', 'DRAFT', ['cantidad', ['3', '6', '12', '24'], 'pistola']),
  ];
  const products = items.map((item) => item.product);
  const variants = items.flatMap((item) => item.opts[1].map((value, index) => ({
    id: `${item.product.id}-${index}`, product_id: item.product.id, title: value, sku: `${item.product.id}-${value}`, price: 1000, inventory_quantity: 1,
    options: item.opts[2] ? [{ name: item.opts[2], value: 'Default Title' }, { name: item.opts[0], value }] : [{ name: item.opts[0], value }],
  })));
  const proposals = groupProposals(products, variants);
  assert.equal(proposals.length, 2);
  for (const proposal of proposals) {
    assert.deepEqual(proposal.options.map((option) => option.name), ['Aplicación', 'Pack']);
    assert.deepEqual(proposal.options[0].values.sort(), ['Manual', 'Pistola']);
    assert.equal(proposal.warnings.length, 0);
  }
  assert.deepEqual(proposals.find((proposal) => proposal.name.startsWith('Kit')).options[1].values.sort(), ['x12', 'x24', 'x3', 'x6']);
});
