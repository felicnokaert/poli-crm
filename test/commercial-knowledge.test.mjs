import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_STAGES, ECERA, KNOWLEDGE_META, OBJECTIONS, PLAYBOOKS, findObjections, playbooksForFamily } from '../src/commercial-knowledge.mjs';

test('commercial knowledge matches the approved manual inventory', () => {
  assert.equal(COMMERCIAL_STAGES.length, 12);
  assert.equal(ECERA.length, 5);
  assert.equal(OBJECTIONS.length, 13);
  assert.equal(PLAYBOOKS.length, 10);
});

test('every knowledge entry has stable identity and traceability', () => {
  for (const collection of [COMMERCIAL_STAGES, OBJECTIONS, PLAYBOOKS]) {
    assert.equal(new Set(collection.map((item) => item.id)).size, collection.length);
    assert.ok(collection.every((item) => item.source === KNOWLEDGE_META.source && item.status === 'aprobado'));
  }
});

test('finds objections by commercial meaning and response', () => {
  assert.equal(findObjections('proveedor')[0].id, 'proveedor');
  assert.equal(findObjections('fecha límite')[0].id, 'entrega');
});

test('selects relevant playbooks by family and keeps Mercado Libre cross-family', () => {
  const results = playbooksForFamily('CARROZADOS').map((item) => item.id);
  assert.ok(results.includes('carrozados'));
  assert.ok(results.includes('mercadolibre'));
  assert.ok(!results.includes('prfv'));
});
