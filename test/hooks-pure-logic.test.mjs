// Tests de la lógica pura extraída de los hooks nuevos en src/hooks/. Los
// hooks en sí mezclan efectos de React (useState/useEffect, Supabase,
// localStorage) con lógica de decisión que no necesita ninguno de esos
// mundos para probarse. Se extrajo esa lógica como funciones exportadas
// (mismo comportamiento, sin reescribir nada) para poder testearla acá sin
// renderizar el hook ni mockear Supabase/localStorage.
//
// useSelectedRecords.js queda deliberadamente sin test acá: son tres
// useState independientes (qué interacción/cliente/tarea está abierta en un
// modal) sin ninguna transformación de datos - no hay lógica pura que
// extraer sin inventar algo artificial.
//
// useWorkspaceSync.js importa (transitivamente, vía ../online) React y
// @supabase/supabase-js y usa `import.meta.env`, cosas que `node --test` no
// resuelve de forma nativa (falta de extensión en imports tipo bundler,
// `import.meta.env` inexistente fuera de Vite). Se reutiliza el mismo
// loader basado en rolldown que test/components-smoke.test.mjs usa para
// JSX (ver test/helpers/load-jsx.mjs) para compilar el hook a un módulo
// plano antes de importarlo — no hace falta que el archivo sea .jsx, sólo
// que sus imports transitivos se resuelvan como lo haría un bundler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJsxModule } from './helpers/load-jsx.mjs';

const workspaceSyncMod = await loadJsxModule('src/hooks/useWorkspaceSync.js');
const { reconcileLoadedWorkspaceState, applyInboundWhatsAppEvent } = workspaceSyncMod;
const { resolveInitialCollapsedNavGroups } = await loadJsxModule('src/hooks/useNavGroups.js');

// --- reconcileLoadedWorkspaceState (useWorkspaceSync.js) ---

test('reconcileLoadedWorkspaceState no toca nada si el estado cargado ya está al día', () => {
  const state = {
    inbox: [],
    historyResetVersion: '2026-09-03T16:00:00.000Z',
    tasksClosedThrough: '2026-09-09.1',
  };
  const { nextState, dirty, statusEvents } = reconcileLoadedWorkspaceState({ state, statusEvents: [{ id: 's1' }] });
  assert.equal(dirty, false);
  assert.equal(nextState.historyResetVersion, '2026-09-03T16:00:00.000Z');
  assert.deepEqual(statusEvents, [{ id: 's1' }]);
});

test('reconcileLoadedWorkspaceState resetea interactions y marca dirty cuando historyResetVersion quedó vieja', () => {
  const state = {
    inbox: [],
    interactions: [{ id: 'i1' }],
    historyResetVersion: '2026-08-01T00:00:00.000Z',
    tasksClosedThrough: '2026-09-09.1',
  };
  const { nextState, dirty } = reconcileLoadedWorkspaceState({ state });
  assert.equal(dirty, true);
  assert.deepEqual(nextState.interactions, []);
  assert.equal(nextState.historyResetVersion, '2026-09-03T16:00:00.000Z');
});

test('reconcileLoadedWorkspaceState completa tareas vencidas y marca dirty cuando tasksClosedThrough está atrasado', () => {
  const state = {
    inbox: [],
    historyResetVersion: '2026-09-03T16:00:00.000Z',
    tasksClosedThrough: '2026-01-01',
    tasks: [{ id: 't1', done: false, dueDate: '2026-01-05' }],
  };
  const { nextState, dirty } = reconcileLoadedWorkspaceState({ state });
  assert.equal(dirty, true);
  assert.equal(nextState.tasks[0].done, true);
  assert.equal(nextState.tasksClosedThrough, '2026-09-09.1');
});

test('reconcileLoadedWorkspaceState devuelve statusEvents como [] si no vino ninguno', () => {
  const { statusEvents } = reconcileLoadedWorkspaceState({ state: { inbox: [] } });
  assert.deepEqual(statusEvents, []);
});

// --- applyInboundWhatsAppEvent (useWorkspaceSync.js) ---

function workspace(overrides = {}) {
  return {
    inbox: [],
    clients: [],
    tasks: [],
    dismissedInboxEventIds: [],
    ignoredWhatsAppContacts: [],
    ...overrides,
  };
}

test('applyInboundWhatsAppEvent agrega el evento al inbox y crea un recordatorio si hay cliente conocido', () => {
  const current = workspace({
    clients: [{ id: 'c1', company: 'Cliente Uno', contacts: [{ whatsappId: '5491100000001' }] }],
  });
  const event = {
    event_id: 'e1',
    direction: 'inbound',
    channel: 'general',
    customer_wa_id: '5491100000001',
  };
  const next = applyInboundWhatsAppEvent(current, event);
  assert.equal(next.inbox.length, 1);
  assert.equal(next.inbox[0].event_id, 'e1');
  assert.equal(next.tasks.length, 1);
  assert.equal(next.tasks[0].clientId, 'c1');
  assert.equal(next.tasks[0].title, 'Revisar nuevo mensaje de WhatsApp');
});

test('applyInboundWhatsAppEvent es un no-op si el evento ya está en el inbox (mismo event_id)', () => {
  const current = workspace({ inbox: [{ event_id: 'e1' }] });
  const next = applyInboundWhatsAppEvent(current, { event_id: 'e1', direction: 'inbound' });
  assert.equal(next, current);
});

test('applyInboundWhatsAppEvent es un no-op si el evento fue descartado a mano (dismissedInboxEventIds)', () => {
  const current = workspace({ dismissedInboxEventIds: ['e1'] });
  const next = applyInboundWhatsAppEvent(current, { event_id: 'e1', direction: 'inbound' });
  assert.equal(next, current);
});

test('applyInboundWhatsAppEvent no crea un segundo recordatorio si ya existe uno pendiente para el mismo cliente', () => {
  const current = workspace({
    clients: [{ id: 'c1', company: 'Cliente Uno', contacts: [{ whatsappId: '5491100000001' }] }],
    tasks: [{ id: 't1', clientId: 'c1', done: false, title: 'Revisar nuevo mensaje de WhatsApp' }],
  });
  const event = { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491100000001' };
  const next = applyInboundWhatsAppEvent(current, event);
  assert.equal(next.tasks.length, 1);
  assert.equal(next.inbox.length, 1);
});

test('applyInboundWhatsAppEvent no crea recordatorio cuando el evento no corresponde a ningún cliente conocido', () => {
  const current = workspace();
  const event = { event_id: 'e1', direction: 'inbound', channel: 'general', customer_wa_id: '5491199999999' };
  const next = applyInboundWhatsAppEvent(current, event);
  assert.equal(next.tasks.length, 0);
  assert.equal(next.inbox.length, 1);
});

// --- resolveInitialCollapsedNavGroups (useNavGroups.js) ---

test('resolveInitialCollapsedNavGroups devuelve los grupos por defecto si no hay nada guardado', () => {
  assert.deepEqual(resolveInitialCollapsedNavGroups(null, ['a', 'b']), ['a', 'b']);
});

test('resolveInitialCollapsedNavGroups devuelve los grupos por defecto si lo guardado es un array vacío', () => {
  // Un [] guardado no distingue "el usuario abrió todo" de "nunca tocó nada".
  assert.deepEqual(resolveInitialCollapsedNavGroups('[]', ['a', 'b']), ['a', 'b']);
});

test('resolveInitialCollapsedNavGroups respeta lo guardado cuando el usuario sí eligió algo', () => {
  assert.deepEqual(resolveInitialCollapsedNavGroups('["a"]', ['a', 'b']), ['a']);
});

test('resolveInitialCollapsedNavGroups devuelve los grupos por defecto ante JSON corrupto', () => {
  assert.deepEqual(resolveInitialCollapsedNavGroups('{not json', ['a', 'b']), ['a', 'b']);
});
