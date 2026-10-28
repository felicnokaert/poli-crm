import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSections, sectionMetafields, stripQuantities } from '../src/shopify-sections.mjs';
import { draftTexts, hasQuantityVariants } from '../src/shopify-missing.mjs';
import { buildProductSet } from '../lib/shopify-write.mjs';

const ML = `Espuma proyectable en spray. Aísla superficies irregulares.

Importante: no incluye pistola.

Características:
- Alta eficiencia térmica
- Sin contracción

Áreas de aplicación
Techos y paredes
Tuberías

Especificaciones técnicas:
Presión: 3 bar

Instrucciones de uso:
1. Agitar 20 veces
2. Enroscar a la pistola

Limitaciones y consejos:
No usar con agua permanente`;

test('la descripción de ML se parte en presentación, metacampos y lo que sigue en la descripción', () => {
  const r = splitSections(ML);
  assert.match(r.presentation, /Espuma proyectable/);
  assert.match(r.presentation, /no incluye pistola/);
  assert.deepEqual(r.sections.caracteristicas, ['Alta eficiencia térmica', 'Sin contracción']);
  assert.deepEqual(r.sections.areas_de_aplicacion, ['Techos y paredes', 'Tuberías']);
  assert.equal(r.sections.instrucciones_de_uso, 'Agitar 20 veces\nEnroscar a la pistola');
  assert.deepEqual(r.sections['limitaciones_y_consejos-'], ['No usar con agua permanente']);
  assert.match(r.kept, /Especificaciones técnicas/);
  assert.match(r.kept, /Presión: 3 bar/);
  assert.ok(!r.presentation.includes('Características'));
});

test('sin títulos reconocidos todo queda como presentación', () => {
  const r = splitSections('Un producto simple.\n\nSirve para todo.');
  assert.equal(r.presentation, 'Un producto simple.\n\nSirve para todo.');
  assert.deepEqual(r.sections, {});
});

test('los metacampos salen con su tipo: listas en JSON y texto de varias líneas', () => {
  const fields = sectionMetafields(splitSections(ML).sections);
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));
  assert.equal(byKey.caracteristicas.type, 'list.single_line_text_field');
  assert.deepEqual(JSON.parse(byKey.caracteristicas.value), ['Alta eficiencia térmica', 'Sin contracción']);
  assert.equal(byKey.instrucciones_de_uso.type, 'multi_line_text_field');
});

test('con variantes por cantidad no se dice cuántas unidades trae', () => {
  const out = stripQuantities('Kit completo.\nIncluye:\n- 3 Espuma Pu-46 Canula\n- 1 Limpiador Penosil\n✔ Elegí pack de 3, 6, 12 o 24 unidades\nPack de 6 espumas x3');
  assert.ok(!/\b(3|6|12|24)\b/.test(out.replace(/Pu-46/, '')), out);
  assert.match(out, /- Espuma Pu-46 Canula/);
  assert.match(out, /- Limpiador Penosil/);
  assert.ok(!/Elegí/.test(out));
});

test('draftTexts: grupo por kits saca cantidades y manda las secciones a metacampos', () => {
  const lead = { description: 'Kit Penosil.\nIncluye:\n- 3 Espuma\n\nCaracterísticas:\n- Rápida', group: null };
  const list = [{ kitQty: 3 }, { kitQty: 6 }];
  assert.equal(hasQuantityVariants(list, true), true);
  const r = draftTexts(lead, list, true);
  assert.ok(!/\b3\b/.test(r.description), r.description);
  assert.equal(r.sections[0].key, 'caracteristicas');
  assert.equal(draftTexts(lead, [{ kitQty: null }], false).description.includes('3 Espuma'), true);
});

test('buildProductSet acepta metacampos de lista y de varias líneas', () => {
  const input = buildProductSet({
    title: 'Producto', variants: [{ sku: 'A-1', price: 10, stock: false }],
    metafields: [
      { key: 'marca', value: 'Penosil' },
      { key: 'caracteristicas', type: 'list.single_line_text_field', value: JSON.stringify(['uno', 'dos']) },
      { key: 'instrucciones_de_uso', type: 'multi_line_text_field', value: 'paso 1\npaso 2' },
    ],
  }, {});
  const byKey = Object.fromEntries(input.metafields.map((field) => [field.key, field]));
  assert.equal(byKey.marca.type, 'single_line_text_field');
  assert.equal(byKey.caracteristicas.type, 'list.single_line_text_field');
  assert.deepEqual(JSON.parse(byKey.caracteristicas.value), ['uno', 'dos']);
  assert.equal(byKey.instrucciones_de_uso.value, 'paso 1\npaso 2');
});
