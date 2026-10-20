import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticTaskCount, cleanCopiedWorkspace } from '../src/workspace-cleanup.mjs';
import { trelloJsonToTasks } from '../src/trello-json-import.mjs';
import { mergeDirectory, toDirectoryRecord } from '../src/shared-directory.mjs';
import { buildPriceMemory, ivaLabel } from '../src/price-memory.mjs';
import { canSeeRapypMap } from '../src/personal-tools.mjs';

const felipe = {
  tasks: [{ id: 't-felipe', title: 'Reputación ML' }],
  deletedRecordIds: { tasks: ['t-borrada'] },
  clients: [{ id: 'c1', company: 'Corralón Sur', city: 'Rosario', notes: 'DEBE PLATA', stage: 'Negociación', sourceType: 'Cliente activo' }],
  sales: [{ id: 's1' }],
  planChecks: { '2026-10-16:ml': true },
  ignoredWhatsAppContacts: [{ key: 'k-felipe' }],
  profileName: 'Felipe',
};

test('la limpieza saca lo copiado de Felipe y deja lo propio', () => {
  const juan = {
    tasks: [{ id: 't-felipe' }, { id: 't-borrada' }, { id: 't-juan' }, { id: 'auto-1', source: 'auto-hot-lead', done: false }],
    clients: [{ id: 'c1', company: 'Corralón Sur', city: 'Rosario', notes: 'DEBE PLATA', stage: 'Negociación', sourceType: 'Cliente activo', phone: '341' }, { id: 'c-juan', company: 'Propia', notes: 'mía' }],
    sales: [{ id: 's1' }],
    inbox: [{ event_id: 'e1', channel: 'general' }, { event_id: 'e2', channel: 'juan' }],
    planChecks: { '2026-10-16:ml': true },
    ignoredWhatsAppContacts: [{ key: 'k-felipe' }, { key: 'k-juan' }],
    profileName: 'Felipe',
  };
  const { state, removed, changed } = cleanCopiedWorkspace(juan, [felipe], { allowedChannels: ['juan'], stamp: 'S' });
  assert.equal(changed, true);
  assert.deepEqual(state.tasks.map((t) => t.id), ['t-juan', 'auto-1']);
  assert.deepEqual(state.deletedRecordIds.tasks, ['t-borrada', 't-felipe']);
  assert.deepEqual(state.sales, []);
  assert.deepEqual(state.inbox.map((e) => e.event_id), ['e2']);
  assert.deepEqual(state.planChecks, {});
  assert.deepEqual(state.ignoredWhatsAppContacts, [{ key: 'k-juan' }]);
  assert.equal(state.profileName, undefined);
  const c1 = state.clients.find((c) => c.id === 'c1');
  assert.equal(c1.notes, undefined);
  assert.equal(c1.stage, undefined);
  assert.equal(c1.company, 'Corralón Sur');
  assert.equal(c1.sourceType, 'Cliente activo');
  assert.equal(c1.phone, '341');
  assert.equal(state.clients.find((c) => c.id === 'c-juan').notes, 'mía');
  assert.equal(removed.tasks, 2);
  assert.equal(automaticTaskCount(state), 1);
});

test('una cuenta sin nada de Felipe queda igual', () => {
  const own = { tasks: [{ id: 'x' }], inbox: [{ event_id: 'e', channel: 'juan' }], profileName: 'Juan' };
  const result = cleanCopiedWorkspace(own, [felipe], { allowedChannels: ['juan'] });
  assert.equal(result.changed, false);
  assert.deepEqual(result.state, own);
});

test('Importar tareas de Trello lee el JSON exportado, sin archivadas ni repetidas', () => {
  const board = {
    name: 'Mi tablero',
    lists: [{ id: 'l1', name: 'Hacer' }, { id: 'l2', name: 'Viejo', closed: true }],
    cards: [
      { id: 'a', name: 'Llamar a Ana', idList: 'l1', due: '2026-10-20T15:00:00.000Z', shortUrl: 'https://trello.com/c/a' },
      { id: 'b', name: 'Archivada', idList: 'l1', closed: true },
      { id: 'c', name: 'En lista cerrada', idList: 'l2' },
      { id: 'd', name: 'Ya cargada', idList: 'l1' },
    ],
  };
  const tasks = trelloJsonToTasks(JSON.stringify(board), [{ id: 'trello-d' }], 'S');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Llamar a Ana');
  assert.equal(tasks[0].dueDate, '2026-10-20');
  assert.equal(tasks[0].trigger, 'Trello · Hacer');
  assert.equal(tasks[0].source, 'trello-import');
  assert.throws(() => trelloJsonToTasks('{"foo":1}'));
});

test('el directorio lleva la clasificación y el tipo aplicador, sin productos', () => {
  const client = { id: 'c1', company: 'Spray SA', sourceType: 'Cliente activo', polio8: { products: [{ name: 'ISOBUNKER 618 SP', qty: 900 }] }, notes: 'x' };
  const record = toDirectoryRecord(client);
  assert.equal(record.sourceType, 'Cliente activo');
  assert.equal(record.tipoCliente, 'aplicador');
  assert.equal(record.polio8, undefined);
  assert.equal(record.notes, undefined);
});

test('traer el directorio de nuevo completa la clasificación de las que ya tenía', () => {
  const mine = [{ id: 'c1', company: 'Spray SA', sourceType: 'A confirmar', notes: 'mía' }, { id: 'c2', company: 'Otra', sourceType: 'No corresponde' }];
  const records = [{ id: 'c1', company: 'Spray SA', sourceType: 'Cliente activo', tipoCliente: 'aplicador' }, { id: 'c2', company: 'Otra', sourceType: 'Cliente activo' }];
  const result = mergeDirectory(mine, records, 'S');
  assert.equal(result.updated, 1);
  assert.equal(result.clients[0].tipoCliente, 'aplicador');
  assert.equal(result.clients[0].sourceType, 'Cliente activo');
  assert.equal(result.clients[0].notes, 'mía');
  assert.equal(result.clients[1].sourceType, 'No corresponde');
});

test('la memoria de precios aclara que es + IVA', () => {
  const memory = buildPriceMemory([{ date: '2026-10-01', currency: 'USD', items: [{ description: '618', unitPrice: 5.5, ivaPercent: 21 }] }]);
  const entry = memory.get('618');
  assert.equal(ivaLabel(entry), '+ IVA 21%');
  assert.equal(ivaLabel({ unitPrice: 1 }), '+ IVA');
  assert.equal(ivaLabel({ ivaPercent: 10.5 }), '+ IVA 10,5%');
});

test('el mapa RAPYP lo ven solo Felipe, Juan y David', () => {
  for (const email of ['felipe@grupopoliplast.com.ar', 'Juan@grupopoliplast.com.ar', 'david@grupopoliplast.com.ar']) assert.equal(canSeeRapypMap(email), true, email);
  for (const email of ['brenda@grupopoliplast.com.ar', 'yuliani@grupopoliplast.com.ar', '']) assert.equal(canSeeRapypMap(email), false, email);
});

test('limpieza: las empresas copiadas salen del pipeline y se van las tareas automáticas que generaron', async () => {
  const { cleanCopiedWorkspace } = await import('../src/workspace-cleanup.mjs');
  const owner = { clients: [{ id: 'c9', company: 'Ruben', outcome: 'Abierto' }], inbox: [{ customer_wa_id: '5491155551234', channel: 'general' }] };
  const juan = {
    clients: [{ id: 'c9', company: 'Ruben' }, { id: 'mia', company: 'Propia', pipelineActive: true }],
    tasks: [
      { id: 'a1', source: 'auto-stale-client', autoKey: 'c9', clientId: 'c9', done: false },
      { id: 'a2', source: 'auto-hot-lead', autoKey: 'general:5491155551234', done: false },
      { id: 'a3', source: 'auto-stale-client', autoKey: 'mia', clientId: 'mia', done: false },
      { id: 'a4', source: 'auto-stale-client', autoKey: 'c9', clientId: 'c9', done: true },
    ],
  };
  const { state, removed } = cleanCopiedWorkspace(juan, [owner], { allowedChannels: ['juan'], stamp: 'S' });
  assert.deepEqual(state.tasks.map((t) => t.id), ['a3']);
  assert.equal(removed.automaticTasks, 3);
  assert.equal(state.clients.find((c) => c.id === 'c9').pipelineActive, false);
  assert.equal(state.clients.find((c) => c.id === 'mia').pipelineActive, true);
});

test('"Retomar contacto" no se genera para empresas fuera del pipeline (directorio)', async () => {
  const { findStaleClients } = await import('../src/stale-clients-radar.mjs');
  const old = '2026-08-01T00:00:00Z';
  const found = findStaleClients([{ id: 'x', company: 'X', createdAt: old, pipelineActive: false }, { id: 'y', company: 'Y', createdAt: old }], [], [], { today: new Date('2026-10-16') });
  assert.deepEqual(found.map((item) => item.clientId), ['y']);
});

test('RAPYP para Juan y David: une las cuentas de Felipe y deja solo campos del mapa', async () => {
  const { mergeOwnerClients } = await import('../lib/rapyp-clients.mjs');
  const merged = mergeOwnerClients([
    { clients: [{ id: '1', company: 'Spray', city: 'Rosario', notes: 'privado', updatedAt: '1', polio8: { products: [{ name: 'X SP' }] } }, { id: '2', company: 'Borrada' }], deletedRecordIds: { clients: ['2'] } },
    { clients: [{ id: '1', company: 'Spray SA', city: 'Rosario', updatedAt: '2' }] },
  ]);
  assert.deepEqual(merged.map((c) => c.company), ['Spray SA']);
  assert.equal(merged[0].notes, undefined);
});

test('el Cierre del día no cuenta lo que el sistema cerró solo por vencido', async () => {
  const { reviewDay } = await import('../src/day-review.mjs');
  const { completeTasksThrough } = await import('../src/workspace.mjs');
  const closed = completeTasksThrough({ tasks: [{ id: 'v', title: 'Vencida', dueDate: '2026-10-10', done: false }] }, '2026-10-16T06:00:00Z');
  assert.equal(closed.tasks[0].autoClosed, true);
  const today = closed.tasks[0].completedAt.slice(0, 10);
  const mine = { id: 'm', title: 'Llamé', done: true, completedAt: `${today}T15:00:00Z` };
  const review = reviewDay(today, { tasks: [...closed.tasks, mine], includeRoutine: false });
  assert.deepEqual(review.doneTasks.map((task) => task.id), ['m']);
});

test('Inicio no muestra "Retomar contacto" guardado de empresas que ya no se trabajan', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/Dashboard.jsx', import.meta.url), 'utf8');
  assert.match(src, /dailySignals\.staleClients \|\| \[\]\)\.filter\(stillWorked\)/);
});

test('limpieza: empresas que Felipe borró y sus tareas automáticas también se van', async () => {
  const { cleanCopiedWorkspace } = await import('../src/workspace-cleanup.mjs');
  const owner = { clients: [], deletedRecordIds: { clients: ['corbeb'] } };
  const juan = {
    clients: [{ id: 'corbeb', company: 'CORBEB S R L', createdAt: '2026-09-01' }, { id: 'propia', company: 'Propia', pipelineActive: true }],
    tasks: [
      { id: 't1', source: 'auto-stale-client', clientId: 'corbeb', autoKey: 'corbeb', done: true, title: 'Retomar contacto con CORBEB S R L' },
      { id: 't2', source: 'auto-stale-client', clientId: 'propia', autoKey: 'propia', done: false },
      { id: 't3', title: 'Mía', done: true },
    ],
  };
  const { state, removed } = cleanCopiedWorkspace(juan, [owner], { allowedChannels: ['juan'] });
  assert.deepEqual(state.clients.map((c) => c.id), ['propia']);
  assert.deepEqual(state.tasks.map((t) => t.id), ['t2', 't3']);
  assert.equal(removed.deletedClients, 1);
  assert.ok(state.deletedRecordIds.clients.includes('corbeb'));
});

test('las automáticas cerradas por la corrida de las 6 (antes del arreglo) tampoco cuentan', async () => {
  const { closedBySystem } = await import('../src/day-review.mjs');
  assert.equal(closedBySystem({ source: 'auto-stale-client', done: true, completedAt: '2026-10-16T06:00:41.000Z' }), true);
  assert.equal(closedBySystem({ source: 'auto-stale-client', done: true, completedAt: '2026-10-16T14:10:00.000Z' }), false);
  assert.equal(closedBySystem({ title: 'Mía', done: true, completedAt: '2026-10-16T06:05:00.000Z' }), false);
});

test('limpieza: también se van las automáticas que cerró el sistema solo (Juan las veía como hechas)', async () => {
  const { cleanCopiedWorkspace } = await import('../src/workspace-cleanup.mjs');
  const juan = { clients: [{ id: 'mia', company: 'Propia', pipelineActive: true }], tasks: [
    { id: 'a', source: 'auto-hot-lead', autoKey: 'juan:5491100000000', done: true, autoClosed: true, completedAt: '2026-10-16T06:00:10Z' },
    { id: 'b', source: 'auto-stale-client', clientId: 'mia', autoKey: 'mia', done: true, completedAt: '2026-10-15T06:00:20Z' },
    { id: 'c', title: 'La hice yo', done: true, completedAt: '2026-10-16T15:00:00Z' },
  ] };
  const { state } = cleanCopiedWorkspace(juan, [{ clients: [] }], { allowedChannels: ['juan'] });
  assert.deepEqual(state.tasks.map((t) => t.id), ['c']);
});

test('Importar de Trello actualiza lo que ya estaba sin pisar fechas del CRM', async () => {
  const { trelloJsonSync, applyTrelloUpdates } = await import('../src/trello-json-import.mjs');
  const board = (cards) => JSON.stringify({ lists: [{ id: 'l1', name: 'Hacer' }], cards: cards.map((c) => ({ idList: 'l1', ...c })) });
  // Tarea del plan (fecha repartida, sin trelloDue): la primera vez solo anota la fecha de Trello.
  let tasks = [{ id: 'trello-p', title: 'Viejo', dueDate: '2026-10-22', done: false }, { id: 'trello-h', title: 'Hecha', dueDate: '2026-10-21', done: true }];
  let r = trelloJsonSync(board([{ id: 'p', name: 'Nuevo nombre', due: '2026-11-05T12:00:00Z' }, { id: 'h', name: 'Hecha' }, { id: 'n', name: 'Nueva' }]), tasks, 'S');
  assert.equal(r.added.length, 1);
  assert.equal(r.changed, 1);
  tasks = applyTrelloUpdates(tasks, r.updates);
  assert.equal(tasks[0].title, 'Nuevo nombre');
  assert.equal(tasks[0].dueDate, '2026-10-22');
  assert.equal(tasks[0].trelloDue, '2026-11-05');
  assert.equal(tasks[1].done, true);
  // Después cambia la fecha en Trello y la completan: se toma.
  r = trelloJsonSync(board([{ id: 'p', name: 'Nuevo nombre', due: '2026-11-10T12:00:00Z', dueComplete: true }]), tasks, 'S2');
  tasks = applyTrelloUpdates(tasks, r.updates);
  assert.equal(tasks[0].dueDate, '2026-11-10');
  assert.equal(tasks[0].done, true);
  assert.deepEqual(r.updates[0].changes, ['hecha', 'fecha']);
  // Sin cambios: nada.
  assert.equal(trelloJsonSync(board([{ id: 'p', name: 'Nuevo nombre', due: '2026-11-10T12:00:00Z', dueComplete: true }]), tasks).updates.length, 0);
});
