function normalized(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
}

export function conversationIdentity(interaction = {}) {
  return interaction.clientId || normalized(interaction.company || interaction.contact || interaction.id || 'sin-identificar');
}

export function groupConversationHistory(interactions = []) {
  // Un nombre parecido no prueba identidad. Las fichas con clientId sólo se
  // agrupan por ese ID. Un registro histórico sin clientId puede sumarse por
  // nombre únicamente cuando ese nombre corresponde a una sola ficha; si hay
  // dos candidatas queda separado para revisión, nunca se oculta el conflicto.
  const companyClientIds = new Map();
  for (const interaction of interactions) {
    if (!interaction.clientId || !interaction.company) continue;
    const key = normalized(interaction.company);
    companyClientIds.set(key, new Set([...(companyClientIds.get(key) || []), interaction.clientId]));
  }
  const groups = new Map();
  interactions.forEach((interaction) => {
    const companyKey = normalized(interaction.company || '');
    const candidates = companyClientIds.get(companyKey);
    const uniqueCandidate = !interaction.clientId && candidates?.size === 1 ? [...candidates][0] : '';
    const key = interaction.clientId
      ? `client:${interaction.clientId}`
      : uniqueCandidate
        ? `client:${uniqueCandidate}`
        : `legacy:${companyKey || normalized(interaction.contact || interaction.id || 'sin-identificar')}`;
    groups.set(key, [...(groups.get(key) || []), interaction]);
  });
  return [...groups.values()].map((records) => {
    const ordered = [...records].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const latest = ordered.at(-1);
    const clientIds = [...new Set(ordered.map((item) => item.clientId).filter(Boolean))];
    return {
      ...latest,
      conversationKey: `conversation:${clientIds.sort().join('|') || normalized(latest.company || latest.contact || latest.id)}`,
      clientIds,
      records: ordered,
      messageCount: ordered.length,
      firstContactAt: ordered[0]?.createdAt || '',
      latestContactAt: latest?.createdAt || '',
    };
  }).sort((a, b) => new Date(b.latestContactAt || 0) - new Date(a.latestContactAt || 0));
}

export function filterInteractionsByDate(interactions = [], from = '', to = '') {
  const start = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  return interactions.filter((item) => {
    const stamp = new Date(item.createdAt || 0).getTime();
    return Number.isFinite(stamp) && stamp >= start && stamp <= end;
  });
}

export function addInteractionOnce(interactions = [], interaction = {}) {
  if (!interaction.sourceEventId) return [interaction, ...interactions];
  const existingIndex = interactions.findIndex((item) => item.sourceEventId === interaction.sourceEventId);
  if (existingIndex < 0) return [interaction, ...interactions];
  return interactions.map((item, index) => index === existingIndex
    ? { ...item, ...interaction, id: item.id }
    : item);
}
