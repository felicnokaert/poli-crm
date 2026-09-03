function normalized(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
}

export function whatsappContactKey(event = {}) {
  return normalized(event.customer_wa_id || event.customer_name || event.event_id || 'unknown');
}

function messageFingerprint(event = {}) {
  const sourceKey = event.raw_payload?.source_message_key;
  if (sourceKey) return normalized(sourceKey);
  if (!String(event.event_id || '').startsWith('bridge.open.')) return normalized(event.event_id || '');
  const stamp = Date.parse(event.occurred_at || '');
  const twoMinuteWindow = Number.isNaN(stamp) ? '' : Math.floor(stamp / 120000);
  return normalized(`${event.direction}|${event.customer_name}|${event.text_body}|${twoMinuteWindow}`);
}

export function dedupeWhatsAppEvents(events = []) {
  const exact = new Map();
  for (const event of events) {
    const key = messageFingerprint(event) || normalized(`${event.direction}|${event.text_body}|${event.occurred_at || ''}`);
    const current = exact.get(key);
    if (!current) {
      exact.set(key, event);
      continue;
    }
    if (current.channel !== event.channel) {
      const preferred = current.channel === 'general' ? current : event.channel === 'general' ? event : current;
      exact.set(key, { ...preferred, channelConflict: true, conflictingChannels: [...new Set([current.channel, event.channel])].filter(Boolean) });
    }
  }
  return [...exact.values()];
}

export function groupWhatsAppThreads(items = []) {
  const groups = new Map();
  // Deducir antes de agrupar es esencial: dos navegadores pueden exponer el
  // mismo chat con títulos diferentes (nombre completo, alias o teléfono).
  // Si agrupamos primero, esas dos capturas nunca llegan a compararse.
  for (const item of dedupeWhatsAppEvents(items)) {
    const key = whatsappContactKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([threadKey, rawEvents]) => {
    const deduped = rawEvents;
    const previewTypes = new Set(['unread_notice', 'verified_unread_preview', 'unread_chat_preview']);
    const hasRealMessage = deduped.some((item) => !previewTypes.has(item.message_type));
    const ordered = deduped.filter((item) => !hasRealMessage || !previewTypes.has(item.message_type)).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const latest = ordered.at(-1);
    const pendingCount = ordered.filter((item) => item.classification_status === 'pending').length;
    return {
      ...latest,
      threadKey,
      events: ordered,
      channels: [...new Set(ordered.map((item) => item.channel).filter(Boolean))],
      channelConflict: ordered.some((item) => item.channelConflict),
      messageCount: ordered.length,
      pendingCount,
      classification_status: pendingCount ? 'pending' : latest.classification_status,
    };
  }).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}
