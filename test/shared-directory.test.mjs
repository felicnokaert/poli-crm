import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDirectory, publishableClients, toDirectoryRecord } from '../src/shared-directory.mjs';

const client = {
  id: 'c1', company: 'Corralón Sur', city: 'Rosario', province: 'Santa Fe', family: 'Poliuretano', phone: '341',
  notes: 'DEBE PLATA', memoryNote: 'privado', outcome: 'x', lastPurchase: '2026-01-01', potential: 'alto', stage: 'Negociación',
  temperature: 'Caliente', pipelineActive: true, relationship: 'buena', urgency: 'alta', fit: 'si', cuit: '30-1',
  contacts: [{ id: 'k1', name: 'Ana', phone: '341', notes: 'privado', primary: true }],
};

test('el directorio no incluye notas, compras ni números comerciales', () => {
  const record = toDirectoryRecord(client);
  for (const key of ['notes', 'memoryNote', 'outcome', 'lastPurchase', 'potential', 'stage', 'temperature', 'pipelineActive', 'relationship', 'urgency', 'fit', 'cuit']) {
    assert.equal(record[key], undefined, key);
  }
  assert.equal(record.company, 'Corralón Sur');
  assert.deepEqual(record.contacts, [{ id: 'k1', name: 'Ana', phone: '341', primary: true }]);
});

test('solo se publican empresas con nombre', () => {
  assert.equal(publishableClients([client, { id: 'x', company: ' ' }, { company: 'Sin id' }]).length, 1);
});

test('mergeDirectory suma lo que falta y no pisa ni duplica', () => {
  const mine = [{ id: 'z', company: 'Corralón Sur', city: 'Rosario', notes: 'mío' }];
  const records = [toDirectoryRecord(client), { id: 'c2', company: 'Pinturería Norte', city: 'Salta' }];
  const r = mergeDirectory(mine, records, 'S');
  assert.equal(r.added, 1);
  assert.equal(r.clients[0].notes, 'mío');
  assert.equal(r.clients[1].company, 'Pinturería Norte');
  assert.equal(r.clients[1].source, 'Directorio del equipo');
  assert.equal(mergeDirectory(r.clients, records).added, 0);
});
