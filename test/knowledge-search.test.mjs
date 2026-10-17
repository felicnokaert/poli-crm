import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgePrompt, searchKnowledge, tokensOf } from '../src/knowledge-search.mjs';

const sources = {
  products: [{ name: 'AGLUPLAST 2', sku: 'PU-A1150-2', family: 'Poliuretano' }, { name: 'BALDE 10L', family: 'Baldes' }],
  docs: [{ id: 'd1', title: 'Ficha Agluplast', product: 'AGLUPLAST 2', family: 'Poliuretano', status: 'vigente', notes: 'adhesivo para espuma' }, { id: 'd2', title: 'Borrador', status: 'inventariado', notes: 'adhesivo' }],
  clients: [{ id: 'c1', company: 'Poliuretanos del Norte', rubro: 'aplicador de espuma' }],
  sellers: [{ id: 'juan', name: 'Juan', role: 'Gerente', area: 'máquinas y repuestos', assist: [] }],
  objections: [{ id: 'o1', label: 'Está caro', meaning: 'compara precio', explore: 'qué compara', response: 'valor' }],
  competitors: [{ id: 'k1', name: 'Satch', kind: 'equipos', families: ['Poliuretano'], summary: 'vende máquinas' }, { id: 'k2', name: 'Cliente X', kind: 'cliente', summary: 'máquinas' }],
};

test('tokensOf ignora acentos y palabras vacías', () => {
  assert.deepEqual(tokensOf('¿Qué máquinas para el poliuretano?'), ['maquinas', 'poliuretano']);
});

test('busca en todas las fuentes, solo fichas vigentes, sin clientes marcados como tales', () => {
  const r = searchKnowledge('espuma adhesivo máquinas', sources);
  assert.deepEqual(r.groups.fichas.map((i) => i.id), ['d1']);
  assert.ok(r.groups.competencia.some((i) => i.title === 'Satch'));
  assert.ok(!r.groups.competencia.some((i) => i.title === 'Cliente X'));
  assert.ok(r.groups.vendedores.length === 1);
  assert.ok(r.total >= 4);
});

test('sin palabras útiles no devuelve nada', () => {
  assert.equal(searchKnowledge('que es', sources).total, 0);
});

test('la consulta para IA lista lo hallado y avisa cuando no hay respaldo', () => {
  const found = buildKnowledgePrompt('agluplast', searchKnowledge('agluplast', sources));
  assert.match(found, /AGLUPLAST 2/);
  const none = buildKnowledgePrompt('zzzz', searchKnowledge('zzzz', sources));
  assert.match(none, /no encontró datos propios/);
});

import { searchKnowledge as search2, snippetFor, buildKnowledgePrompt as prompt2 } from '../src/knowledge-search.mjs';
test('las fichas se buscan por su texto completo y muestran el pedacito donde aparece', () => {
  const docs = [{ id: 'd1', title: 'Ficha PU-618', product: 'Espuma PU-618', family: 'Penosil', status: 'vigente', extracted_text: 'Introducción. '.repeat(30) + 'Resiste temperaturas de servicio de -40 a +80 °C, apta para cámaras frigoríficas. ' + 'Final. '.repeat(30) }];
  const result = search2('camaras frigorificas', { docs });
  assert.equal(result.groups.fichas.length, 1);
  const item = result.groups.fichas[0];
  assert.match(item.snippet, /cámaras frigoríficas/);
  assert.ok(item.snippet.startsWith('…') && item.snippet.endsWith('…'));
  assert.ok(item.snippet.length < 220);
  assert.match(prompt2('camaras frigorificas', result), /La ficha dice: "…/);
  assert.equal(snippetFor('', ['hola']), '');
  assert.equal(snippetFor('texto sin coincidencia', ['zzz']), '');
});
