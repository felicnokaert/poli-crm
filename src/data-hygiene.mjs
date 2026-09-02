const TEST_MARKERS = [
  /cliente\s+prueba\s+claude/i,
  /^test\s+number$/i,
  /prueba\s+t[eé]cnica\s+(?:codex|firmada)/i,
  /evento\s+ficticio\s+de\s+verificaci[oó]n/i,
  /no\s+es\s+un\s+cliente\s+real/i,
  /^(?:constructora\s+ficticia\s+srl|frigor[ií]fico\s+test\s+sa|carrocer[ií]a\s+demo|aislaciones\s+prueba|distribuidora\s+ejemplo|consulta\s+(?:general|penosil)\s+demo)$/i,
];

function recordValues(record = {}) {
  return [record.company, record.contact, record.customer_name, record.customerName, record.chat_name, record.title, record.summary, record.text_body, record.notes]
    .filter(Boolean)
    .map((value) => String(value).trim());
}

export function isExplicitTestRecord(record = {}) {
  const values = recordValues(record);
  return values.some((value) => TEST_MARKERS.some((pattern) => pattern.test(value)));
}

export function testDataCandidates(data = {}) {
  const clients = (data.clients || []).filter(isExplicitTestRecord);
  const clientIds = new Set(clients.map((item) => item.id));
  const interactions = (data.interactions || []).filter((item) => clientIds.has(item.clientId) || isExplicitTestRecord(item));
  const interactionIds = new Set(interactions.map((item) => item.id));
  const tasks = (data.tasks || []).filter((item) => clientIds.has(item.clientId) || isExplicitTestRecord(item));
  const opportunities = (data.opportunities || []).filter((item) => clientIds.has(item.clientId) || isExplicitTestRecord(item));
  const inbox = (data.inbox || []).filter((item) => isExplicitTestRecord(item) || interactionIds.has(item.sourceEventId));
  return { clients, interactions, tasks, opportunities, inbox };
}

export function removeExplicitTestData(data = {}) {
  const candidates = testDataCandidates(data);
  const ids = (items, key = 'id') => new Set(items.map((item) => item[key]).filter(Boolean));
  const clientIds = ids(candidates.clients);
  const interactionIds = ids(candidates.interactions);
  const taskIds = ids(candidates.tasks);
  const opportunityIds = ids(candidates.opportunities);
  const inboxIds = ids(candidates.inbox, 'event_id');
  return {
    ...data,
    clients: (data.clients || []).filter((item) => !clientIds.has(item.id)),
    interactions: (data.interactions || []).filter((item) => !interactionIds.has(item.id)),
    tasks: (data.tasks || []).filter((item) => !taskIds.has(item.id)),
    opportunities: (data.opportunities || []).filter((item) => !opportunityIds.has(item.id)),
    inbox: (data.inbox || []).filter((item) => !inboxIds.has(item.event_id)),
    dismissedInboxEventIds: [...new Set([...(data.dismissedInboxEventIds || []), ...inboxIds])],
  };
}
