import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProspect, cleanupSummary, cleanupCsv, classifyAll, discardMany, keepMany, resinplastFit, volumeFit, penosilFit } from '../src/prospect-cleanup.mjs';
import { blankProspect, REJECTION_REASONS } from '../src/prospect-model.mjs';

const make = (fields) => blankProspect({ id: fields.id || fields.company, ...fields });

test('Resinplast: reparación es perfil, fabricante de piletas se baja, náutica y tanques se revisan', () => {
  assert.equal(resinplastFit('Reparación y revestimiento de piscinas').fit, 'alta');
  assert.equal(resinplastFit('Tablas de surf a medida').fit, 'alta');
  assert.equal(resinplastFit('Taller de reparación y restyling').fit, 'alta');
  assert.equal(resinplastFit('Piscinas de fibra (fabricante)').fit, 'bajar');
  assert.equal(resinplastFit('Piscinas de fibra (venta e instalación)').fit, 'bajar');
  assert.equal(resinplastFit('Astillero (lanchas)').fit, 'revisar');
  assert.equal(resinplastFit('PRFV industrial (tanques, piezas)').fit, 'revisar');
});

test('clasifica el teléfono: celular, fijo y sin teléfono', () => {
  assert.equal(classifyProspect(make({ company: 'A', phone: '+54 9 11 5555-1234' })).contact, 'celular');
  assert.equal(classifyProspect(make({ company: 'B', phone: '+54 291 426-6676' })).contact, 'fijo');
  assert.equal(classifyProspect(make({ company: 'C', phone: '' })).contact, 'sin-telefono');
  assert.equal(classifyProspect(make({ company: 'D', phone: '12' })).contact, 'sin-telefono');
});

test('estado de trabajo: cliente, cerrado, en curso y pendiente', () => {
  assert.equal(classifyProspect(make({ company: 'A', linkedClientId: 'c1', state: 'Contactado' })).status, 'cliente');
  assert.equal(classifyProspect(make({ company: 'B', state: 'Sin interés' })).status, 'cerrado');
  assert.equal(classifyProspect(make({ company: 'C', state: 'Contactado' })).status, 'en-curso');
  assert.equal(classifyProspect(make({ company: 'D' })).status, 'pendiente');
});

test('otras familias no se juzgan y lo conservado deja de sugerirse', () => {
  assert.equal(classifyProspect(make({ company: 'A', family: 'Carrozados', rubro: 'Carrocerías' })).fit, 'normal');
  const piletas = make({ company: 'P', family: 'Resinplast', rubro: 'Piscinas de fibra (fabricante)' });
  assert.equal(classifyProspect(piletas).fit, 'bajar');
  assert.equal(classifyProspect({ ...piletas, cleanupKept: true }).fit, 'conservado');
});

test('el resumen cuenta solo lo pendiente y aparta clientes y cerrados', () => {
  const list = [
    make({ company: 'a', family: 'Resinplast', rubro: 'Piscinas', phone: '+54 291 426-6676' }),
    make({ company: 'b', family: 'Resinplast', rubro: 'Reparación de piscinas', phone: '+54 9 11 5555-1234' }),
    make({ company: 'c', family: 'Carrozados', rubro: 'Carrocerías', phone: '' }),
    make({ company: 'd', linkedClientId: 'x', state: 'Contactado' }),
    make({ company: 'e', state: 'Sin interés' }),
  ];
  const summary = cleanupSummary(list);
  assert.deepEqual([summary.total, summary.pending, summary.clients, summary.closed], [5, 3, 1, 1]);
  assert.deepEqual([summary.celular, summary.fijo, summary.sinTelefono, summary.alta, summary.bajar], [1, 1, 1, 1, 1]);
});

test('discardMany marca «Sin interés» con motivo y no toca a los demás', () => {
  const state = { prospects: [make({ id: 'p1', company: 'A' }), make({ id: 'p2', company: 'B' })], clients: [], tasks: [] };
  const { state: next, done } = discardMany(state, ['p1'], { outcome: 'Fabricante (no es perfil)', user: 'felipe@x.com' });
  assert.equal(done, 1);
  assert.equal(next.prospects[0].state, 'Sin interés');
  assert.equal(next.prospects[0].outcome, 'Fabricante (no es perfil)');
  assert.equal(next.prospects[1].state, 'No contactado');
  assert.equal(next.clients.length, 0);
  assert.equal(next.tasks.length, 0);
});

test('keepMany marca los prospectos como conservados', () => {
  const state = { prospects: [make({ id: 'p1', company: 'A' })] };
  assert.equal(keepMany(state, ['p1']).prospects[0].cleanupKept, true);
});

test('el motivo nuevo está entre los de rechazo y el CSV escapa comillas', () => {
  assert.ok(REJECTION_REASONS.includes('Fabricante (no es perfil)'));
  const rows = classifyAll([make({ company: 'Casa "Norte"', family: 'Resinplast', rubro: 'Piscinas', phone: '+54 291 426-6676' })]);
  const csv = cleanupCsv(rows);
  assert.match(csv, /"Casa ""Norte"""/);
  assert.match(csv, /Fijo/);
});

test('Poliuretano y Planchas: el que revende se baja, el que aísla es prioridad, el resto se revisa', () => {
  assert.equal(volumeFit('Poliuretano', 'Aberturas (distribuidor)').fit, 'bajar');
  assert.equal(volumeFit('Poliuretano', 'Aberturas (distribuidor)').outcome, 'Es revendedor (no es perfil)');
  assert.equal(volumeFit('Poliuretano', 'Almohadas y colchones (comercio)').fit, 'bajar');
  assert.equal(volumeFit('Planchas', 'Refrigeración (venta)').fit, 'bajar');
  assert.equal(volumeFit('Planchas', 'Distribuidor de aislantes').fit, 'bajar');
  assert.equal(volumeFit('Planchas', 'Refrigeración (fabricante y venta)').fit, 'alta');
  assert.equal(volumeFit('Poliuretano', 'Calderas y tanques industriales (fabricante)').fit, 'alta');
  assert.equal(volumeFit('Poliuretano', 'Heladeras y exhibidoras (fabricante)').fit, 'alta');
  assert.equal(volumeFit('Planchas', 'Cámaras frigoríficas (fabricante)').fit, 'alta');
  assert.equal(volumeFit('Planchas', 'Casas container').fit, 'alta');
  assert.equal(volumeFit('Poliuretano', 'Colchones (fábrica)').fit, 'revisar');
  assert.equal(volumeFit('Poliuretano', 'Aberturas de aluminio (fabricante)').fit, 'revisar');
  assert.equal(volumeFit('Poliuretano', 'Pesquera y mayorista').fit, 'revisar');
  assert.equal(volumeFit('Planchas', 'Metalúrgica').fit, 'revisar');
});

test('classifyProspect usa la regla de volumen en Poliuretano y Planchas', () => {
  assert.equal(classifyProspect(make({ company: 'X', family: 'Poliuretano', rubro: 'Calderas (fabricante)' })).fit, 'alta');
  assert.equal(classifyProspect(make({ company: 'Y', family: 'Planchas', rubro: 'Refrigeración (venta)' })).outcome, 'Es revendedor (no es perfil)');
});

test('Penosil: corralón y ferretería son el perfil, lo ajeno se revisa', () => {
  assert.equal(penosilFit('Corralón/ferretería').fit, 'alta');
  assert.equal(penosilFit('Ferretería industrial').fit, 'alta');
  assert.equal(penosilFit('Materiales de construcción en seco').fit, 'alta');
  assert.equal(penosilFit('Distribuidor agropecuario').fit, 'revisar');
  assert.equal(classifyProspect(make({ company: 'Z', family: 'Penosil', rubro: 'Corralón' })).fit, 'alta');
});
