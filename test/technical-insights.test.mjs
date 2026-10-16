import test from 'node:test';
import assert from 'node:assert/strict';
import { clientSuggestions, keyFacts, matchesSearch, QUALITY_FILTERS } from '../src/technical-insights.mjs';

const docs = [
  { id: 'd618', title: 'PDS isoBUNKER 618-SP', status: 'vigente', storagePath: 'x/618.pdf', sourceFile: 'POLIURETANOS/Ficha 618 SP/618.pdf',
    extractedText: 'Sistema de espuma rígida de poliuretano proyectable\nTemperatura de trabajo\n45 - 50 °C en manguera\nDensidad libre 38-42 kg/m³\nAlmacenar entre 15 y 25 °C, vida útil 6 meses\nTambor 200 kg' },
  { id: 'dfoam', title: 'PENOSIL EasySpray Foam 111', status: 'inventariado', extractedText: 'Sprayable foam for thermal insulation of roofs\nOutput (1 layer) 1 m²/can' },
  { id: 'dvacio', title: 'Manual sin texto', status: 'inventariado' },
];

test('datos clave de una ficha, con sus líneas literales', () => {
  const facts = keyFacts(docs[0]);
  const byKey = Object.fromEntries(facts.map((fact) => [fact.key, fact.lines]));
  assert.ok(byKey.temperatura.some((line) => line.includes('45 - 50 °C')));
  assert.ok(byKey.densidad.some((line) => line.includes('38-42 kg/m³')));
  assert.ok(byKey.presentacion.some((line) => line.includes('Tambor 200 kg')));
  assert.ok(!(byKey.rendimiento || []).some((line) => line.includes('Densidad')), 'la densidad no se repite como rendimiento');
  assert.ok(byKey.almacenamiento.some((line) => line.includes('Almacenar')));
  assert.deepEqual(keyFacts(docs[2]), []);
});

test('buscador y filtros de calidad de la lista', () => {
  assert.equal(matchesSearch(docs[0], '618'), true);
  assert.equal(matchesSearch(docs[0], 'isobunker 618'), true);
  assert.equal(matchesSearch(docs[1], '618'), false);
  const linked = new Set(['d618']);
  assert.deepEqual(docs.filter((doc) => QUALITY_FILTERS.sinTexto[1](doc, linked)).map((d) => d.id), ['dvacio']);
  assert.deepEqual(docs.filter((doc) => QUALITY_FILTERS.sinVincular[1](doc, linked)).map((d) => d.id), ['dfoam', 'dvacio']);
  assert.deepEqual(docs.filter((doc) => QUALITY_FILTERS.pendientes[1](doc, linked)).map((d) => d.id), ['dfoam', 'dvacio']);
});

test('qué le conviene a una empresa: la ficha de lo que compra y lo que encaja con su rubro', () => {
  const client = { company: 'Aislaciones Sur', family: 'Poliuretano', industry: 'Construcción', mainProduct: 'aislación térmica de techos', polio8: { products: [{ name: 'ISOBUNKER 618 SP' }] } };
  const result = clientSuggestions(client, docs);
  assert.deepEqual(result.own.map((item) => item.doc.id), ['d618']);
  assert.ok(result.related.some((item) => item.doc.id === 'dfoam'), 'propone la espuma para aislación de techos');
  assert.ok(!result.related.some((item) => item.doc.id === 'd618'), 'no repite lo que ya compra');
});

test('qué productos del catálogo usan cada ficha', async () => {
  const { docProductMap } = await import('../src/technical-insights.mjs');
  const products = [{ id: 'p1', name: 'ISOBUNKER 618 SP TAMBOR', family: 'Poliuretano' }, { id: 'p2', name: 'Almohada viscoelástica 618', family: 'Descanso' }, { id: 'p3', name: 'Kit X', family: 'Resinas' }];
  const map = docProductMap(products, docs, [{ document_id: 'dvacio', scope_type: 'product', product_id: 'p3' }]);
  assert.deepEqual(map.get('d618').map((p) => p.id), ['p1']);
  assert.deepEqual(map.get('dvacio').map((p) => p.id), ['p3']);
  assert.equal(map.has('dfoam'), false);
});
