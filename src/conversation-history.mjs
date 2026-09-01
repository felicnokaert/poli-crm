function normalized(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
}

export function conversationIdentity(interaction = {}) {
  return interaction.clientId || normalized(interaction.company || interaction.contact || interaction.id || 'sin-identificar');
}

export function groupConversationHistory(interactions = []) {
  const groups = new Map();
  for (const interaction of interactions) {
    const key = conversationIdentity(interaction);
    groups.set(key, [...(groups.get(key) || []), interaction]);
  }
  return [...groups.entries()].map(([conversationKey, records]) => {
    const ordered = [...records].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const latest = ordered.at(-1);
    return {
      ...latest,
      conversationKey,
      records: ordered,
      messageCount: ordered.length,
      firstContactAt: ordered[0]?.createdAt || '',
      latestContactAt: latest?.createdAt || '',
    };
  }).sort((a, b) => new Date(b.latestContactAt || 0) - new Date(a.latestContactAt || 0));
}
