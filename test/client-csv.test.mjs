import test from 'node:test';
import assert from 'node:assert/strict';
import { clientsToCsv, mergeClientsCsv } from '../src/client-csv.mjs';

test('exports a UTF-8 Excel-friendly CSV and preserves quoted text', () => {
  const csv = clientsToCsv([{ company: 'Empresa; Sur', family: 'Penosil', pipelineActive: true, notes: 'Línea 1\nLínea 2' }]);
  assert.ok(csv.startsWith('\uFEFFEmpresa;'));
  assert.match(csv, /"Empresa; Sur"/);
  assert.match(csv, /"Línea 1\nLínea 2"/);
});

test('imports and deduplicates clients by CUIT before company', () => {
  const csv = 'Empresa;CUIT;Familia;Teléfono\r\nEmpresa Nueva;30-123;Penosil;111\r\nNombre actualizado;30-999;PURMAC;222';
  const result = mergeClientsCsv([{ id: 'old', company: 'Viejo nombre', cuit: '30-999', family: 'Otra' }], csv);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.clients.length, 2);
  assert.equal(result.clients.find((item) => item.id === 'old').company, 'Nombre actualizado');
});

test('imports several PUR Comercial contacts into one company without losing phone numbers', () => {
  const csv = 'Nombre empresa,telefono,Contacto,Familia,Proveedor\r\nCarrocerias del Sur,1138169296,Cristian,CARROZADOS,PURCOM\r\nCarrocerias del Sur,1160000000,Ana,CARROZADOS,PURCOM';
  const result = mergeClientsCsv([], csv);
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].contacts.length, 2);
  assert.deepEqual(result.clients[0].contacts.map((item) => item.name), ['Cristian', 'Ana']);
});

test('reports a repeated phone across different PUR Comercial company names instead of silently merging', () => {
  const csv = 'Nombre empresa,telefono\r\nZatti Sebastian,3435118264\r\nTecno Pur,3435118264';
  const result = mergeClientsCsv([], csv);
  assert.equal(result.clients.length, 2);
  assert.equal(result.duplicatePhones.length, 1);
});
