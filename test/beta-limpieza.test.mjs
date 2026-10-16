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
