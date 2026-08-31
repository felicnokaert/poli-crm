const EMPTY_STATE = { clients: [], interactions: [], tasks: [], inbox: [] };

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

export function mergeWorkspaceState(local = EMPTY_STATE, remote = EMPTY_STATE) {
  return {
    clients: mergeRecords(local.clients, remote.clients),
    interactions: mergeRecords(local.interactions, remote.interactions).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    tasks: mergeRecords(local.tasks, remote.tasks),
    inbox: mergeRecords(local.inbox, remote.inbox, 'event_id').sort((a, b) => (b.occurred_at || '').localeCompare(a.occurred_at || '')),
  };
}

export function workspaceStatesEqual(left = EMPTY_STATE, right = EMPTY_STATE) {
  return JSON.stringify(mergeWorkspaceState(EMPTY_STATE, left)) === JSON.stringify(mergeWorkspaceState(EMPTY_STATE, right));
}
