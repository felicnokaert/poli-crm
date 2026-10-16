import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProspectsText } from '../src/prospect-import.mjs';

test('lee un CSV con ; y mapea encabezados por nombre', () => {
  const { rows, ignored, error } = parseProspectsText('Empresa;Teléfono;Sitio web;Localidad;Provincia;Rubro\nCorralón Norte;0343 4231234;norte.com.ar;Paraná;Entre Ríos;corralón\n;sin nombre;;;;\n');
  assert.equal(error, '');
  assert.equal(ignored, 1);
  assert.deepEqual(rows[0], { company: 'Corralón Norte', phone: '0343 4231234', website: 'norte.com.ar', city: 'Paraná', province: 'Entre Ríos', rubro: 'corralón' });
});

test('detecta tabulaciones (pegado desde una planilla) y comillas con separadores adentro', () => {
  const { rows } = parseProspectsText('Nombre\tCiudad\tDirección\n"Ferretería ""El Clavo"", Hnos."\tColón\t"Calle 1, 23"');
  assert.equal(rows[0].company, 'Ferretería "El Clavo", Hnos.');
  assert.equal(rows[0].address, 'Calle 1, 23');
});

test('avisa cuando falta la columna de nombre o no hay filas', () => {
  assert.match(parseProspectsText('Teléfono;Ciudad\n1;2').error, /Empresa/);
  assert.match(parseProspectsText('solo una línea').error, /Pegá una tabla/);
});

import { buildImportPlan, prospectFieldsFromRow } from '../src/prospect-import.mjs';
import { markProspect } from '../src/prospect-convert.mjs';
import { prospectFamilyKey } from '../src/prospect-model.mjs';

test('reconoce las familias de la planilla (PRFV, Planchas de PUR, Carrozados...)', () => {
  assert.equal(prospectFamilyKey('PRFV'), 'Resinplast');
  assert.equal(prospectFamilyKey('Planchas de PUR'), 'Planchas');
  assert.equal(prospectFamilyKey('CARROZADOS'), 'Carrozados');
  assert.equal(prospectFamilyKey('Carrozados Imperpur'), 'Carrozados Imperpur');
  assert.equal(prospectFamilyKey('Química'), 'Química');
  assert.equal(prospectFamilyKey('algo raro'), '');
  assert.equal(prospectFieldsFromRow({ company: 'X', family: 'algo raro' }).imported.familyRaw, 'algo raro');
});

test('lee todas las columnas de RELEVAMIENTO', () => {
  const header = 'Nombre empresa;Familia;Subfamilia;provincia;ciudad;Maquina;Proveedor;telefono;email;Estado;Comercial;Contacto;observaciones;Fecha de seguimiento;Tipo entidad;Producto / propuesta;Estado comercial;Valor potencial;Próxima acción;Fecha próxima acción';
  const row = 'Empresa Uno;Penosil;Ferreterías;Entre Ríos;Paraná;M1;Prov;0343 1;a@b.com;Relevado;Ana;Luis;obs;2026-10-20;Distribuidora;Espuma;Prospecto;USD 1000;Llamar;2026-10-21';
  const { rows } = parseProspectsText(`${header}\n${row}`);
  const fields = prospectFieldsFromRow(rows[0]);
  assert.deepEqual([fields.company, fields.family, fields.rubro, fields.province, fields.city, fields.machine, fields.currentSupplier, fields.phone, fields.email, fields.contact, fields.notes],
    ['Empresa Uno', 'Penosil', 'Ferreterías', 'Entre Ríos', 'Paraná', 'M1', 'Prov', '0343 1', 'a@b.com', 'Luis', 'obs']);
  assert.deepEqual(fields.imported, { subfamily: 'Ferreterías', owner: 'Ana', sheetState: 'Relevado', followUpDate: '2026-10-20', entityType: 'Distribuidora', proposal: 'Espuma', commercialState: 'Prospecto', potentialValue: 'USD 1000', nextAction: 'Llamar', nextDate: '2026-10-21' });
});

test('el plan cruza contra el CRM, los prospectos y las filas anteriores sin guardar nada', () => {
  const clients = [{ id: 'c1', company: 'PIERANDREI S.A.', city: 'Paraná' }, { id: 'c2', company: 'Silvacom S.R.L.', city: '' }];
  const prospects = [{ id: 'p0', company: 'Corralón Norte', city: 'Colón' }];
  const rows = [
    { company: 'Pierandrei', city: 'Parana' }, { company: 'SILVACOM', city: 'Concordia' }, { company: 'Corralón Norte S.A.', city: 'Colón' },
    { company: 'Ferretería Sur', city: 'Paraná' }, { company: 'Ferretería Sur S.R.L.', city: 'Paraná' }, { company: 'Argenpur Sur', city: 'Rosario' },
  ];
  let n = 0;
  const plan = buildImportPlan(rows, clients, prospects, { makeId: () => `id${n += 1}`, now: '2026-10-14T00:00:00Z' });
  // Regla 7.3: solo los nuevos se crean; el posible duplicado (SILVACOM, otra localidad) se elige a mano.
  assert.deepEqual(plan.counts, { total: 6, nuevas: 2, existentes: 3, posibles: 1, enCrm: 1, aCompletar: 0 });
  assert.deepEqual(plan.toImport.map((item) => item.company), ['Ferretería Sur', 'Argenpur Sur']);
  assert.deepEqual(plan.possibles.map((item) => item.company), ['SILVACOM']);
  assert.ok(plan.toImport.every((item) => item.state === 'No contactado' && item.source === 'importado'));
  assert.equal(plan.toImport[1].competitor, true);
  assert.equal(prospects.length, 1, 'no modifica los prospectos existentes');
});

test('al pasar a Empresa se llevan el contacto, la máquina, el proveedor y las notas de la planilla', () => {
  const { rows } = parseProspectsText('Nombre empresa;Familia;Contacto;Maquina;Proveedor;observaciones;Producto / propuesta;Próxima acción;Fecha próxima acción\nOptimall;Planchas de PUR;Marcos;Pegadora;Argenpur;Compra por pallet;Plancha 1000x1100;Llamar;2026-10-21');
  const plan = buildImportPlan(rows, [], [], { makeId: () => 'p1', now: '2026-10-14T00:00:00Z' });
  const { state } = markProspect({ clients: [], prospects: plan.toImport }, 'p1', 'Contactado', { newClientId: 'c1' });
  const client = state.clients[0];
  assert.deepEqual([client.contact, client.machine, client.currentSupplier, client.family], ['Marcos', 'Pegadora', 'Argenpur', 'Poliuretano']);
  assert.equal(client.notes, 'Compra por pallet · Producto / propuesta: Plancha 1000x1100 · Próxima acción: Llamar (2026-10-21)');
});

test('la columna "Por qué encaja" de la investigación se guarda en las notas', async () => {
  const { parseProspectsText, buildImportPlan } = await import('../src/prospect-import.mjs');
  const parsed = parseProspectsText('| Empresa | Evidencia (con link a la fuente) | Por qué encaja (1 frase) |\n|---|---|---|\n| Casillas Sur | https://casillas.com.ar | Laminado propio en PRFV |');
  const plan = buildImportPlan(parsed.rows, [], []);
  const notes = plan.items[0].prospect.notes;
  assert.match(notes, /Por qué encaja: Laminado propio en PRFV/);
  assert.match(notes, /Evidencia: https:\/\/casillas\.com\.ar/);
});
