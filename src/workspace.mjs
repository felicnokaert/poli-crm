const EMPTY_STATE = { clients: [], interactions: [], tasks: [], inbox: [], opportunities: [], sales: [], dismissedInboxEventIds: [], ignoredWhatsAppContacts: [], planChecks: {}, commercialMasterVersion: '', historyResetVersion: '', tasksClosedThrough: '' };
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
  return {
    ...state,
    tasks: (state.tasks || []).map((task) =>
      !task.done && task.dueDate && task.dueDate <= cutoff
        ? { ...task, done: true, completedAt: stamp, updatedAt: stamp }
        : task,
    ),
    tasksClosedThrough: cutoff,
  };
}

export function mergeWorkspaceState(local = EMPTY_STATE, remote = EMPTY_STATE) {
  const dismissedInboxEventIds = [...new Set([...(remote.dismissedInboxEventIds || []), ...(local.dismissedInboxEventIds || [])])].sort();
  const dismissed = new Set(dismissedInboxEventIds);
  const localHistoryReset = local.historyResetVersion || '';
  const remoteHistoryReset = remote.historyResetVersion || '';
  return consolidateDuplicateClients({
    clients: mergeRecords(local.clients, remote.clients),
    interactions: localHistoryReset || remoteHistoryReset
      ? mergeRecords(
          localHistoryReset >= remoteHistoryReset ? local.interactions : [],
          remoteHistoryReset >= localHistoryReset ? remote.interactions : [],
        ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      : mergeRecords(local.interactions, remote.interactions).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    tasks: mergeRecords(local.tasks, remote.tasks),
    inbox: mergeRecords(local.inbox, remote.inbox, 'event_id')
      .filter((item) => !dismissed.has(item.event_id) && !OBSOLETE_PREVIEW_TYPES.has(item.message_type))
      .sort((a, b) => (b.occurred_at || '').localeCompare(a.occurred_at || '')),
    opportunities: mergeRecords(local.opportunities, remote.opportunities),
    sales: mergeRecords(local.sales, remote.sales),
    dismissedInboxEventIds,
    ignoredWhatsAppContacts: mergeRecords(local.ignoredWhatsAppContacts, remote.ignoredWhatsAppContacts, 'key'),
    planChecks: { ...(remote.planChecks || {}), ...(local.planChecks || {}) },
    commercialMasterVersion: local.commercialMasterVersion || remote.commercialMasterVersion || '',
    historyResetVersion: [localHistoryReset, remoteHistoryReset].sort().at(-1) || '',
    tasksClosedThrough: [local.tasksClosedThrough || '', remote.tasksClosedThrough || ''].sort().at(-1) || '',
  });
}

export function workspaceStatesEqual(left = EMPTY_STATE, right = EMPTY_STATE) {
  return JSON.stringify(mergeWorkspaceState(EMPTY_STATE, left)) === JSON.stringify(mergeWorkspaceState(EMPTY_STATE, right));
}
