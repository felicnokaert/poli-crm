// Regla 7.3 del importador de Prospección.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportPlan, buildImportPlan, importFingerprint, parseProspectsText } from '../src/prospect-import.mjs';

const CSV = [
  'Empresa;CUIT;Teléfono;Localidad;Provincia;Sitio web;Email',
  'Aislaciones Sur;30-71234567-8;0223 155 123456;Mar del Plata;Buenos Aires;;',
  'Techos Norte;;;Salta;Salta;techosnorte.com.ar;',
  'Frío Andino;;0261 4441234;Mendoza;Mendoza;;',
  'Sin datos SA;;;;;;',
].join('\n');
const opts = (prefix) => { let n = 0; return { makeId: () => `${prefix}${n += 1}`, now: '2026-10-16T12:00:00Z' }; };

function importOnce(prospects, clients = [], text = CSV, prefix = 'a') {
  const plan = buildImportPlan(parseProspectsText(text).rows, clients, prospects, opts(prefix));
  return { plan, ...applyImportPlan(prospects, plan, { now: '2026-10-16T12:00:00Z' }) };
}

test('importar el mismo CSV dos veces no crea ni cambia nada', () => {
  const first = importOnce([]);
  assert.equal(first.created, 4);
  const second = importOnce(first.prospects, [], CSV, 'b');
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.deepEqual(second.prospects, first.prospects);
  assert.equal(second.plan.counts.nuevas, 0);
});

test('compara por CUIT, teléfono (últimos 8), nombre+localidad y sitio web contra Empresas y prospectos', () => {
  const clients = [{ id: 'c1', company: 'Otro nombre SRL', cuit: '30712345678', city: '' }];
  const prospects = [
    { id: 'p1', company: 'Distinto', phone: '+54 9 261 444-1234', city: '' },
    { id: 'p2', company: 'Techos del Norte', website: 'https://www.techosnorte.com.ar/contacto', city: '' },
    { id: 'p3', company: 'Sin Datos S.A.', city: '' },
  ];
  const { plan } = importOnce(prospects, clients);
  const byName = Object.fromEntries(plan.items.map((item) => [item.prospect.company, item]));
  assert.equal(byName['Aislaciones Sur'].status, 'Ya existe');
  assert.equal(byName['Aislaciones Sur'].where, 'Empresas');
  assert.equal(byName['Frío Andino'].status, 'Ya existe');
  assert.equal(byName['Techos Norte'].status, 'Ya existe');
  assert.equal(byName['Sin datos SA'].status, 'Posible duplicado');
  assert.deepEqual(plan.toImport, []);
});

test('nunca pisa un campo con valor; estado, etapa, notas y marcas del equipo ganan', () => {
  const prospects = [{ id: 'p1', company: 'Frío Andino', phone: '0261 4441234', city: 'Mendoza', province: '', email: 'yo@frio.com', state: 'Con interés', outcome: 'Abierto', notes: 'Llamar el lunes', stage: 'Negociación' }];
  const text = 'Empresa;Teléfono;Localidad;Provincia;Email;Estado;Observaciones\nFrío Andino;0261 4441234;Mendoza;Mendoza;otro@frio.com;Sin interés;Nota del CSV';
  const { plan, prospects: after, updated } = importOnce(prospects, [], text);
  assert.equal(plan.items[0].status, 'Ya existe');
  assert.equal(updated, 1);
  const p = after[0];
  assert.equal(p.province, 'Mendoza', 'completa el vacío');
  assert.equal(p.email, 'yo@frio.com', 'no pisa el que tiene valor');
  assert.equal(p.state, 'Con interés');
  assert.equal(p.outcome, 'Abierto');
  assert.equal(p.notes, 'Llamar el lunes');
  assert.equal(p.stage, 'Negociación');
  assert.equal(after.length, 1);
});

test('vista previa con conteos antes de confirmar (no guarda nada)', () => {
  const prospects = [{ id: 'p1', company: 'Frío Andino', phone: '0261 4441234', city: 'Mendoza' }];
  const plan = buildImportPlan(parseProspectsText(CSV).rows, [], prospects, opts('a'));
  assert.deepEqual(plan.counts, { total: 4, nuevas: 3, existentes: 1, posibles: 0, enCrm: 0, aCompletar: 1 });
  assert.equal(prospects.length, 1);
  assert.equal(prospects[0].province, undefined, 'la vista previa no modifica nada');
});

test('los posibles duplicados solo entran si se eligen', () => {
  const prospects = [{ id: 'p3', company: 'Sin Datos S.A.', city: '' }];
  const plan = buildImportPlan(parseProspectsText(CSV).rows, [], prospects, opts('a'));
  const possible = plan.possibles[0];
  assert.equal(applyImportPlan(prospects, plan).created, 3);
  assert.equal(applyImportPlan(prospects, plan, { includePossibleIds: [possible.id] }).created, 4);
});

test('huella del archivo: el mismo contenido da la misma huella (aunque cambien finales de línea)', () => {
  assert.equal(importFingerprint(CSV), importFingerprint(CSV.replace(/\n/g, '\r\n') + '\n'));
  assert.equal(importFingerprint('﻿' + CSV), importFingerprint(CSV));
  assert.notEqual(importFingerprint(CSV), importFingerprint(CSV.replace('Salta;Salta', 'Salta;Jujuy')));
});

test('un teléfono "#ERROR!" se toma como vacío y se avisa', () => {
  const parsed = parseProspectsText('Empresa;Teléfono;Localidad\nCorralón X;#ERROR!;Paraná\nCorralón Y;#N/A;Colón');
  assert.equal(parsed.rows[0].phone, undefined);
  assert.equal(parsed.rows[1].phone, undefined);
  assert.deepEqual(parsed.cellErrors.map((item) => [item.row, item.field, item.value]), [[2, 'phone', '#ERROR!'], [3, 'phone', '#N/A']]);
  const plan = buildImportPlan(parsed.rows, [], [{ id: 'p', company: 'Otro', phone: '#ERROR!' }], opts('a'));
  assert.equal(plan.counts.nuevas, 2, 'un #ERROR! nunca hace coincidir dos teléfonos');
});

test('filas repetidas dentro del mismo archivo: se crea una sola y la segunda completa a la primera', () => {
  const text = 'Empresa;Teléfono;Localidad;Email\nRepetida;0341 4561234;Rosario;\nRepetida SA;0341 4561234;Rosario;r@rep.com';
  const { plan, prospects } = importOnce([], [], text);
  assert.equal(plan.counts.nuevas, 1);
  assert.equal(plan.items[1].where, 'este archivo');
  assert.equal(prospects.length, 1);
  assert.equal(prospects[0].email, 'r@rep.com');
});
