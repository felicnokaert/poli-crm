function normalized(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
}

export function conversationIdentity(interaction = {}) {
  return interaction.clientId || normalized(interaction.company || interaction.contact || interaction.id || 'sin-identificar');
}

export function groupConversationHistory(interactions = []) {
  // Los datos históricos pueden contener dos fichas internas para la misma
  // empresa (por ejemplo, una importada y otra creada desde WhatsApp). Para la
  // vista comercial deben seguir siendo una sola conversación. Unimos registros
  // que compartan clientId O nombre de empresa normalizado, conservando clientIds
  // para que la inconsistencia siga siendo auditable.
  const parents = interactions.map((_, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parents[b] = a;
  };
  const seen = new Map();
  interactions.forEach((interaction, index) => {
    const identities = [
      interaction.clientId && `client:${interaction.clientId}`,
      interaction.company && `company:${normalized(interaction.company)}`,
      !interaction.company && interaction.contact && `contact:${normalized(interaction.contact)}`,
    ].filter(Boolean);
    for (const identity of identities) {
      if (seen.has(identity)) union(index, seen.get(identity));
      else seen.set(identity, index);
    }
  });
  const groups = new Map();
  interactions.forEach((interaction, index) => {
    const key = find(index);
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

export function addInteractionOnce(interactions = [], interaction = {}) {
  if (!interaction.sourceEventId) return [interaction, ...interactions];
  const existingIndex = interactions.findIndex((item) => item.sourceEventId === interaction.sourceEventId);
  if (existingIndex < 0) return [interaction, ...interactions];
  return interactions.map((item, index) => index === existingIndex
    ? { ...item, ...interaction, id: item.id }
    : item);
}
