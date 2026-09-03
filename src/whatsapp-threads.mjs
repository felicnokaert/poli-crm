function normalized(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
}

export function whatsappContactKey(event = {}) {
  const contact = normalized(event.customer_wa_id || event.customer_name || event.event_id || 'unknown');
  // General y Penosil son bandejas diferentes. Un nombre coincidente no
  // demuestra que sea la misma conversación (ni siquiera el mismo teléfono).
  return `${normalized(event.channel || 'unknown')}:${contact}`;
}

export function whatsappContactIdentity(event = {}) {
  return normalized(event.customer_wa_id || event.customer_name || 'unknown');
}

function messageFingerprint(event = {}) {
  const sourceKey = event.raw_payload?.source_message_key;
  if (sourceKey) return normalized(sourceKey);
  if (!String(event.event_id || '').startsWith('bridge.open.')) return normalized(event.event_id || '');
  const stamp = Date.parse(event.occurred_at || '');
  const twoMinuteWindow = Number.isNaN(stamp) ? '' : Math.floor(stamp / 120000);
  return normalized(`${event.direction}|${event.customer_name}|${event.text_body}|${twoMinuteWindow}`);
}

function comparableText(value = '') {
  return normalized(value)
    .replace(/\[audio(?:\s*·\s*[^\]]+)?\]/g, '[audio]')
    .replace(/\s+/g, ' ');
}

function equivalentContactNames(left = '', right = '') {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
}

function isBridgeCapture(id) {
  return String(id || '').startsWith('browser-bridge:');
}

// General llega con customer_wa_id = teléfono real; Penosil (scrapeado) suele
// llegar con customer_wa_id = el propio nombre visible. whatsappContactIdentity
// por sí sola no alcanza para saber que son el mismo contacto en ese caso, así
// que una regla de "no comercial" marcada en un canal no viajaba al otro.
// Reutilizamos el mismo criterio de alias que ya usa la reconciliación de
// hilos (equivalentContactNames) para que la exclusión sí cruce canales.
export function isIgnoredWhatsAppContact(rules = [], event = {}) {
  const identity = whatsappContactIdentity(event);
  const eventName = event.customer_name || event.customer_wa_id || '';
  return rules.some((rule) => {
    const ruleIdentity = rule.contactIdentity || whatsappContactIdentity({ customer_wa_id: rule.customerWaId, customer_name: rule.customerName });
    if (ruleIdentity === identity) return true;
    const ruleName = rule.customerName || rule.customerWaId || '';
    return equivalentContactNames(ruleName, eventName);
  });
}

function isCrossChannelMirror(left = {}, right = {}) {
  if (!left.channel || !right.channel || left.channel === right.channel) return false;
  // El espejo real observado en producción es: Meta manda el mensaje oficial
  // por webhook (phone_number_id real, no browser-bridge) y el navegador
  // pareado a otro canal scrapea la misma conversación como preview. Exigir
  // browser-bridge en los DOS lados dejaba pasar ese caso sin reconciliar.
  // Alcanza con que al menos un lado sea una captura scrapeada.
  if (!isBridgeCapture(left.phone_number_id) && !isBridgeCapture(right.phone_number_id)) return false;
  const leftText = comparableText(left.text_body);
  const rightText = comparableText(right.text_body);
  if (!leftText || leftText !== rightText) return false;
  const distance = Math.abs(Date.parse(left.occurred_at || '') - Date.parse(right.occurred_at || ''));
  const namesMatch = equivalentContactNames(left.customer_name || left.customer_wa_id, right.customer_name || right.customer_wa_id);
  if (namesMatch) return Number.isFinite(distance) && distance <= 15000;
  // Los dos perfiles del puente pueden exponer alias distintos para el mismo
  // contacto. Un texto suficientemente específico capturado en el mismo
  // instante es evidencia fuerte de espejo; estados genéricos y multimedia
  // quedan fuera para no unir clientes reales por accidente.
  const generic = /^\[(audio|image|sticker|video|document)(?:\s*·[^\]]+)?\]$|^(hola|gracias|ok|sí|si|dale|escribiendo\.\.\.)$/i.test(leftText);
  return !generic && leftText.length >= 12 && Number.isFinite(distance) && distance <= 2000;
}

function threadsShareMirrorEvidence(left = {}, right = {}) {
  if (!equivalentContactNames(left.customer_name || left.customer_wa_id, right.customer_name || right.customer_wa_id)) return false;
  if (!isBridgeCapture(left.phone_number_id) && !isBridgeCapture(right.phone_number_id)) return false;
  const exactAlias = normalized(left.customer_name || left.customer_wa_id) === normalized(right.customer_name || right.customer_wa_id);
  const maximumDistance = exactAlias ? 86400000 : 300000;
  return (left.events || []).some((leftEvent) => (right.events || []).some((rightEvent) => {
    const leftText = comparableText(leftEvent.text_body);
    const distance = Math.abs(Date.parse(leftEvent.occurred_at || '') - Date.parse(rightEvent.occurred_at || ''));
    return leftText && leftText === comparableText(rightEvent.text_body) && Number.isFinite(distance) && distance <= maximumDistance;
  }));
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
  const reconciled = [];
  for (const event of [...exact.values()].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at))) {
    const mirrorIndex = reconciled.findIndex((item) => isCrossChannelMirror(item, event));
    if (mirrorIndex < 0) {
      reconciled.push(event);
      continue;
    }
    const current = reconciled[mirrorIndex];
    const preferred = current.channel === 'general' ? current : event.channel === 'general' ? event : current;
    reconciled[mirrorIndex] = { ...preferred, channelConflict: true, conflictingChannels: [...new Set([current.channel, event.channel])].filter(Boolean) };
  }
  return reconciled;
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
  const threads = [...groups.entries()].map(([threadKey, rawEvents]) => {
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
  });
  const reconciledThreads = [];
  for (const thread of threads.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at))) {
    const mirrorIndex = reconciledThreads.findIndex((current) => {
      if (!current.channel || !thread.channel || current.channel === thread.channel) return false;
      if (!equivalentContactNames(current.customer_name || current.customer_wa_id, thread.customer_name || thread.customer_wa_id)) return false;
      // El último mensaje puede diferir porque un perfil se actualiza antes que
      // el otro. Buscamos evidencia compartida dentro del historial del hilo.
      // El nombre por sí solo nunca alcanza.
      return threadsShareMirrorEvidence(current, thread);
    });
    if (mirrorIndex < 0) {
      reconciledThreads.push(thread);
      continue;
    }
    const current = reconciledThreads[mirrorIndex];
    const combined = dedupeWhatsAppEvents([...current.events, ...thread.events]);
    const preferred = current.channel === 'general' ? current : thread.channel === 'general' ? thread : current;
    reconciledThreads[mirrorIndex] = {
      ...preferred,
      events: combined,
      channels: [...new Set([...current.channels, ...thread.channels])],
      channelConflict: true,
      messageCount: combined.length,
      pendingCount: combined.filter((item) => item.classification_status === 'pending').length,
    };
  }
  return reconciledThreads.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}
