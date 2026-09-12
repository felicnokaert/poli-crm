// ============================================================================
// CÓDIGO DESACTIVADO — NO ES FLUJO VIVO. No cuenta como cobertura funcional
// real del CRM; es un guardrail deliberado.
// ============================================================================
//
// `consolidateDuplicateClients` (src/workspace.mjs) fusionaba clientes en
// silencio por nombre de empresa normalizado, corriendo en cada
// sincronización de estado (dentro de mergeWorkspaceState). Se identificó
// como el hallazgo crítico #1 de docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md
// (Sección 1: "el CRM ya fusiona automáticamente, y eso hay que revisar
// antes de sumar nada nuevo") y se desactivó en el commit `f09313e` tras
// verificarse contra duplicados reales de producción.
//
// La especificación es explícita: "Esto no se toca en este documento."
// La función se mantiene en el código (no se borra) porque documenta ese
// hallazgo y porque el flujo de fusión manual reversible (`mergeClients` /
// `undoClientMerge`, sección "client-merge" del proyecto) la reemplazó como
// mecanismo activo. Borrarla perdería ese historial y la evidencia de que
// el riesgo fue identificado y neutralizado a propósito, no por olvido.
//
// Estos dos tests estaban antes en test/workspace-sync.test.mjs, contando
// como "cobertura" de un flujo que en realidad no corre nunca. Se movieron
// acá, con este encabezado, para que quede claro que documentan una función
// desactivada (comportamiento + guardrail de no-reactivación), no un
// flujo activo del CRM. Si algún día se reactiva `consolidateDuplicateClients`
// en cualquier archivo fuera de workspace.mjs, el segundo test de abajo debe
// empezar a fallar — eso es intencional, revisar con mucho cuidado antes de
// dejarlo pasar.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { consolidateDuplicateClients } from '../src/workspace.mjs';

function baseState(overrides = {}) {
  return {
    clients: [],
    interactions: [],
    tasks: [],
    inbox: [],
    opportunities: [],
    sales: [],
    boardLists: [],
    boardCards: [],
    salesGoals: [],
    businessUnits: [],
    deletedRecordIds: {},
    dismissedInboxEventIds: [],
    ignoredWhatsAppContacts: [],
    planChecks: {},
    commercialMasterVersion: '',
    historyResetVersion: '',
    tasksClosedThrough: '',
    primaryChannel: 'general',
    profileName: '',
    mergeLogs: [],
    ...overrides,
  };
}

test('[desactivado] consolidateDuplicateClients fusiona clientes con el mismo nombre de empresa normalizado, si se invoca directamente', () => {
  const state = baseState({
    clients: [
      { id: 'a', company: 'Herrería El Progreso', updatedAt: '2026-01-01T00:00:00Z', contact: 'Marcos', phone: '111' },
      { id: 'b', company: 'herreria el progreso', updatedAt: '2026-02-01T00:00:00Z', contact: 'Marcos', phone: '222' },
    ],
    interactions: [{ id: 'i1', clientId: 'a', text: 'hola' }],
  });
  const next = consolidateDuplicateClients(state);
  assert.equal(next.clients.length, 1);
  // Se queda con la ficha más reciente y sus datos, pero conserva ambos contactos.
  assert.equal(next.clients[0].id, 'b');
  assert.equal(next.clients[0].contacts.length, 2);
  assert.deepEqual(next.interactions.map((i) => i.clientId), ['b']);
});

test('[desactivado] consolidateDuplicateClients existe como función aislada pero no está enganchada a ningún flujo activo del código', () => {
  // Ver docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md Sección 1: la fusión automática por
  // nombre causó el incidente más grave del proyecto. Este test no verifica el
  // comportamiento de la función (eso ya lo hace el test anterior) sino que
  // ningún otro archivo fuente la importe o la invoque, es decir que sigue
  // desactivada. Si este test empieza a fallar, alguien la volvió a conectar
  // y hay que revisar con cuidado antes de dejarlo pasar.
  const sourceFiles = fs.readdirSync(new URL('../src', import.meta.url))
    .filter((name) => (name.endsWith('.mjs') || name.endsWith('.jsx')) && name !== 'workspace.mjs');
  const offenders = sourceFiles.filter((name) => {
    const content = fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    return content.includes('consolidateDuplicateClients');
  });
  assert.deepEqual(offenders, [], `consolidateDuplicateClients no debería estar referenciada fuera de workspace.mjs, pero aparece en: ${offenders.join(', ')}`);
});
