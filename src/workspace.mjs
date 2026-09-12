const EMPTY_STATE = { clients: [], interactions: [], tasks: [], inbox: [], opportunities: [], sales: [], boardLists: [], boardCards: [], salesGoals: [], businessUnits: [], deletedRecordIds: {}, dismissedInboxEventIds: [], ignoredWhatsAppContacts: [], planChecks: {}, commercialMasterVersion: '', historyResetVersion: '', tasksClosedThrough: '', primaryChannel: 'general', profileName: '', mergeLogs: [] };
const RECORD_COLLECTIONS = ['clients', 'interactions', 'tasks', 'opportunities', 'sales', 'boardLists', 'boardCards', 'salesGoals', 'businessUnits'];
const OBSOLETE_PREVIEW_TYPES = new Set(['unread_preview', 'unread_notice', 'verified_unread_preview']);

function normalizedCompany(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function recordStamp(record) {
  return record.updatedAt || record.classifiedAt || record.createdAt || record.occurred_at || '';
}

function mergeRecords(local = [], remote = [], key = 'id') {
  const merged = new Map();
  for (const record of [...remote, ...local]) {
    const id = record?.[key];
    if (!id) continue;
    const current = merged.get(id);
    if (!current || recordStamp(record) >= recordStamp(current)) merged.set(id, { ...current, ...record });
  }
  return [...merged.values()].sort((a, b) => String(a?.[key] || '').localeCompare(String(b?.[key] || '')));
}

function mergeDeletedRecordIds(local = {}, remote = {}) {
  return Object.fromEntries(RECORD_COLLECTIONS.map((collection) => [
    collection,
    [...new Set([...(remote[collection] || []), ...(local[collection] || [])])].sort(),
  ]));
}

export function recordDeletions(state = EMPTY_STATE, deletions = {}) {
  return {
    ...state,
    deletedRecordIds: mergeDeletedRecordIds(deletions, state.deletedRecordIds),
  };
}

export function restoreRecordId(state = EMPTY_STATE, collection, id) {
  if (!RECORD_COLLECTIONS.includes(collection) || !id) return state;
  return {
    ...state,
    deletedRecordIds: {
      ...(state.deletedRecordIds || {}),
      [collection]: (state.deletedRecordIds?.[collection] || []).filter((item) => item !== id),
    },
  };
}

export function consolidateDuplicateClients(state = EMPTY_STATE) {
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const groups = new Map();
  for (const client of clients) {
    const companyKey = normalizedCompany(client.company);
    const key = companyKey ? `company:${companyKey}` : `id:${client.id}`;
    groups.set(key, [...(groups.get(key) || []), client]);
  }
  const aliases = new Map();
  const consolidated = [...groups.values()].map((records) => {
    const ordered = [...records].sort((a, b) => recordStamp(a).localeCompare(recordStamp(b)));
    const canonical = ordered.at(-1);
    for (const item of ordered) aliases.set(item.id, canonical.id);
    const contacts = [];
    const contactKeys = new Set();
    for (const item of ordered) {
      const candidates = [
        ...(Array.isArray(item.contacts) ? item.contacts : []),
        ...(item.contact || item.phone || item.email || item.whatsappId ? [{
          name: item.contact || '', phone: item.phone || item.whatsappId || '', email: item.email || '',
          whatsappId: item.whatsappId || '', primary: item.id === canonical.id, source: item.source || 'Ficha principal',
        }] : []),
      ];
      for (const contact of candidates) {
        const identity = String(contact.whatsappId || contact.phone || contact.email || contact.name || '').trim().toLocaleLowerCase('es-AR');
        if (!identity || contactKeys.has(identity)) continue;
        contactKeys.add(identity);
        contacts.push(contact);
      }
    }
    return Object.assign({}, ...ordered, canonical, { id: canonical.id, contacts });
  });
  const rewire = (records = []) => records.map((record) => record.clientId && aliases.has(record.clientId)
    ? { ...record, clientId: aliases.get(record.clientId) }
    : record);
  return { ...state, clients: consolidated, interactions: rewire(state.interactions), tasks: rewire(state.tasks), opportunities: rewire(state.opportunities) };
}

export function completeTasksThrough(state = EMPTY_STATE, cutoff = '') {
  if (!cutoff || (state.tasksClosedThrough || '') >= cutoff) return state;
  const stamp = new Date().toISOString();
  const cutoffDate = cutoff.slice(0, 10);
  return {
    ...state,
    tasks: (state.tasks || []).map((task) => {
      const taskDate = task.dueDate || String(task.createdAt || '').slice(0, 10);
      return !task.done && taskDate && taskDate <= cutoffDate
        ? { ...task, done: true, completedAt: stamp, updatedAt: stamp }
        : task;
    }),
    tasksClosedThrough: cutoff,
  };
}

export function mergeWorkspaceState(local = EMPTY_STATE, remote = EMPTY_STATE) {
  const dismissedInboxEventIds = [...new Set([...(remote.dismissedInboxEventIds || []), ...(local.dismissedInboxEventIds || [])])].sort();
  const dismissed = new Set(dismissedInboxEventIds);
  const localHistoryReset = local.historyResetVersion || '';
  const remoteHistoryReset = remote.historyResetVersion || '';
  const deletedRecordIds = mergeDeletedRecordIds(local.deletedRecordIds, remote.deletedRecordIds);
  const liveRecords = (collection) => {
    const deleted = new Set(deletedRecordIds[collection] || []);
    return mergeRecords(local[collection], remote[collection]).filter((item) => !deleted.has(item.id));
  };
  // La sincronización sólo reconcilia versiones del mismo registro por ID.
  // Dos clientes con el mismo nombre pueden ser empresas distintas o fichas
  // con datos en conflicto; su posible fusión requiere revisión humana y un
  // registro reversible (ver docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md).
  return {
    clients: liveRecords('clients'),
    interactions: localHistoryReset || remoteHistoryReset
      ? mergeRecords(
          localHistoryReset >= remoteHistoryReset ? local.interactions : [],
          remoteHistoryReset >= localHistoryReset ? remote.interactions : [],
        ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      : mergeRecords(local.interactions, remote.interactions).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    tasks: liveRecords('tasks'),
    inbox: mergeRecords(local.inbox, remote.inbox, 'event_id')
      .filter((item) => !dismissed.has(item.event_id) && !OBSOLETE_PREVIEW_TYPES.has(item.message_type))
      .sort((a, b) => (b.occurred_at || '').localeCompare(a.occurred_at || '')),
    opportunities: liveRecords('opportunities'),
    sales: liveRecords('sales'),
    boardLists: liveRecords('boardLists'),
    boardCards: liveRecords('boardCards'),
    salesGoals: liveRecords('salesGoals'),
    businessUnits: liveRecords('businessUnits'),
    deletedRecordIds,
    dismissedInboxEventIds,
    ignoredWhatsAppContacts: mergeRecords(local.ignoredWhatsAppContacts, remote.ignoredWhatsAppContacts, 'key'),
    planChecks: { ...(remote.planChecks || {}), ...(local.planChecks || {}) },
    commercialMasterVersion: local.commercialMasterVersion || remote.commercialMasterVersion || '',
    historyResetVersion: [localHistoryReset, remoteHistoryReset].sort().at(-1) || '',
    tasksClosedThrough: [local.tasksClosedThrough || '', remote.tasksClosedThrough || ''].sort().at(-1) || '',
    primaryChannel: local.primaryChannel || remote.primaryChannel || 'general',
    profileName: local.profileName || remote.profileName || '',
    mergeLogs: mergeRecords(local.mergeLogs, remote.mergeLogs),
  };
}

// Fusión manual de dos fichas de cliente (Sección 5 de
// docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md). A diferencia de
// consolidateDuplicateClients (desactivada, ver Sección 1 del mismo
// documento), esto nunca corre solo: lo dispara un click humano desde la
// bandeja de "Posibles duplicados", y deja un mergeLog reversible con el
// snapshot completo de ambas fichas y de los registros que se reescribieron.
export function mergeClients(state = EMPTY_STATE, survivorId, mergedId, options = {}) {
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const survivor = clients.find((item) => item.id === survivorId);
  const merged = clients.find((item) => item.id === mergedId);
  if (!survivor || !merged || survivor.id === merged.id) return state;

  const seenContact = new Set();
  const contacts = [
    ...(Array.isArray(survivor.contacts) ? survivor.contacts : []),
    ...(Array.isArray(merged.contacts) ? merged.contacts : []),
  ].filter((contact) => {
    const identity = String(contact.whatsappId || contact.phone || contact.email || contact.name || '').trim().toLocaleLowerCase('es-AR');
    if (!identity) return true;
    if (seenContact.has(identity)) return false;
    seenContact.add(identity);
    return true;
  });

  const stamp = new Date().toISOString();
  const survivorAfter = { ...survivor, ...(options.fieldOverrides || {}), contacts, updatedAt: stamp };

  const affected = {
    interactions: (state.interactions || []).filter((item) => item.clientId === mergedId).map((item) => item.id),
    tasks: (state.tasks || []).filter((item) => item.clientId === mergedId).map((item) => item.id),
    opportunities: (state.opportunities || []).filter((item) => item.clientId === mergedId).map((item) => item.id),
  };
  const rewire = (records = []) => records.map((record) => (record.clientId === mergedId ? { ...record, clientId: survivorId } : record));

  const mergeLogEntry = {
    id: crypto.randomUUID(),
    fecha: stamp,
    ejecutadoPor: options.actor || '',
    clienteSobrevivienteId: survivorId,
    clientesFusionadosIds: [mergedId],
    snapshotAntes: { survivor, merged },
    affectedRecordIds: affected,
    camposConflicto: options.conflictFields || [],
    deshecho: false,
  };

  const nextState = {
    ...state,
    clients: clients.filter((item) => item.id !== mergedId).map((item) => (item.id === survivorId ? survivorAfter : item)),
    interactions: rewire(state.interactions),
    tasks: rewire(state.tasks),
    opportunities: rewire(state.opportunities),
    mergeLogs: [...(state.mergeLogs || []), mergeLogEntry],
  };
  return recordDeletions(nextState, { clients: [mergedId] });
}

// Deshace una fusión mientras exista su mergeLog: restaura ambas fichas tal
// como estaban antes (snapshotAntes) y revierte el clientId sólo en los
// registros que la fusión efectivamente reescribió (affectedRecordIds), no
// en todo lo que hoy apunte al sobreviviente (que puede incluir cosas que ya
// le pertenecían antes de fusionar, o de otra fusión posterior).
export function undoClientMerge(state = EMPTY_STATE, mergeLogId) {
  const logs = Array.isArray(state.mergeLogs) ? state.mergeLogs : [];
  const log = logs.find((entry) => entry.id === mergeLogId && !entry.deshecho);
  if (!log) return state;
  const { survivor, merged } = log.snapshotAntes;
  const affected = log.affectedRecordIds || {};
  const rewireBack = (records = [], ids = []) => {
    const idSet = new Set(ids);
    return records.map((record) => (idSet.has(record.id) ? { ...record, clientId: merged.id } : record));
  };
  const stamp = new Date().toISOString();
  const nextState = {
    ...state,
    clients: [...(state.clients || []).filter((item) => item.id !== survivor.id), survivor, merged],
    interactions: rewireBack(state.interactions, affected.interactions),
    tasks: rewireBack(state.tasks, affected.tasks),
    opportunities: rewireBack(state.opportunities, affected.opportunities),
    mergeLogs: logs.map((entry) => (entry.id === mergeLogId ? { ...entry, deshecho: true, deshechoEn: stamp } : entry)),
  };
  return restoreRecordId(nextState, 'clients', merged.id);
}

export function workspaceStatesEqual(left = EMPTY_STATE, right = EMPTY_STATE) {
  return JSON.stringify(mergeWorkspaceState(EMPTY_STATE, left)) === JSON.stringify(mergeWorkspaceState(EMPTY_STATE, right));
}
