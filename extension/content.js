// Chrome invalida el mundo aislado anterior cuando una extensión sin empaquetar
// se recarga. Esa condición es esperable y no representa una falla del puente.
// Evitamos que quede registrada como un error persistente, pero conservamos
// cualquier otro rechazo para no esconder problemas reales.
globalThis.addEventListener('unhandledrejection', (event) => {
  const message = String(event.reason?.message || event.reason || '');
  if (/Extension context invalidated/i.test(message)) event.preventDefault();
});

const state = { sent: new Set(), initializedChats: new Set(), unreadCounts: new Map(), pendingUnread: null, sending: false, stopped: false, observer: null, timer: null, interval: null, lastDiagnosticKey: '' };
const RECOVERY_KEY = 'poliplast-extension-recovery';

// Si esta carga proviene de una recuperación exitosa, habilitamos nuevamente
// una futura actualización de la extensión sin entrar en un bucle de recargas.
try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* almacenamiento no disponible */ }

function extensionAvailable() {
  try { return Boolean(chrome?.runtime?.id); } catch { return false; }
}

function stopCapture(recover = false) {
  state.stopped = true;
  state.observer?.disconnect();
  clearTimeout(state.timer);
  clearInterval(state.interval);
  if (recover) {
    try {
      if (!sessionStorage.getItem(RECOVERY_KEY)) {
        sessionStorage.setItem(RECOVERY_KEY, new Date().toISOString());
        setTimeout(() => location.reload(), 700);
      }
    } catch { /* la actualización siguiente se recupera con recarga manual */ }
  }
}

function swallowOperation(operation) {
  try {
    if (operation && typeof operation.catch === 'function') operation.catch(() => {});
  } catch { /* contexto anterior */ }
}

function safeStorageGet(keys, done) {
  if (!extensionAvailable()) return done(null);
  try {
    const operation = chrome.storage.local.get(keys, (result) => {
      try {
        if (chrome.runtime.lastError) return done(null);
        return done(result || null);
      } catch { return done(null); }
    });
    swallowOperation(operation);
  } catch { done(null); }
}

function safeStorageSet(values) {
  if (!extensionAvailable()) return;
  try {
    const operation = chrome.storage.local.set(values, () => {
      try { void chrome.runtime.lastError; } catch { /* contexto anterior */ }
    });
    swallowOperation(operation);
  } catch { /* contexto anterior */ }
}

function safeSendEvents(events, done) {
  if (!extensionAvailable()) return done(null);
  try {
    const operation = chrome.runtime.sendMessage({ type: 'POLIPLAST_BRIDGE_EVENTS', events }, (result) => {
      try {
        if (chrome.runtime.lastError) return done(null);
        return done(result || null);
      } catch { return done(null); }
    });
    swallowOperation(operation);
  } catch { done(null); }
}

startWhatsAppCapture();

function queueCapture() {
  if (state.stopped) return;
  try { capture(); } catch { if (!extensionAvailable()) stopCapture(true); }
}

function chatName() {
  const header = document.querySelector('#main header');
  if (!header) return '';
  const selectors = [
    '[data-testid="conversation-info-header-chat-title"]',
    '[data-testid="conversation-header"] span[dir="auto"]',
    '[title][dir="auto"]',
    'span[dir="auto"]',
  ];
  for (const selector of selectors) {
    const value = header.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return '';
}

function chatKey(name) { return name.toLocaleLowerCase('es-AR'); }

function messageNodes() {
  const direct = [...document.querySelectorAll('#main .message-in, #main .message-out')];
  if (direct.length) return direct;
  const containers = [...document.querySelectorAll('#main [data-pre-plain-text]')]
    .map((item) => item.closest('.message-in, .message-out, [data-id]') || item);
  return [...new Set(containers)];
}

function openChatIsGroup() {
  const header = document.querySelector('#main header');
  if (!header) return false;
  return Boolean(header.querySelector('button[aria-label*="grupo" i]'))
    || /información del grupo/i.test(header.innerText || '');
}

function openChatIsSelf(name) {
  return /(?:\(|\b)(tú|tu|you)\)?$/i.test(name || '');
}

function unreadRowDetails(row) {
  const unread = [...row.querySelectorAll('[aria-label]')].find((item) => {
    const label = item.getAttribute('aria-label') || '';
    return /\d+\s+mensajes?\s+no\s+le[ií]dos?/i.test(label) || /\d+\s+unread\s+messages?/i.test(label);
  });
  if (!unread) return null;
  const unreadLabel = unread.getAttribute('aria-label') || '';
  const count = Number(unreadLabel.match(/\d+/)?.[0] || 1);
  const titled = [...row.querySelectorAll('span[title]')].map((item) => item.getAttribute('title')?.trim()).filter(Boolean);
  const name = titled[0] || row.querySelector('span[dir="auto"]')?.textContent?.trim() || '';
  const texts = [...row.querySelectorAll('span[dir="auto"]')].map((item) => item.textContent?.trim()).filter(Boolean);
  const preview = globalThis.PoliplastUnreadParser.previewFromValues({ name, texts, titles: titled });
  return !name || openChatIsSelf(name) ? null : { name, count, preview };
}

function rememberUnreadClick(event) {
  const row = event.target.closest?.('#pane-side [role="row"], #pane-side [role="listitem"]');
  if (!row) return;
  const details = unreadRowDetails(row);
  if (!details) return;
  state.unreadCounts.set(chatKey(details.name), details.count);
  state.pendingUnread = { ...details, readyAt: Date.now() + 900 };
  setTimeout(queueCapture, 950);
}

function unreadPreviews(channel) {
  const rows = [...document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')];
  return rows.flatMap((row) => {
    // WhatsApp también usa "No leído" en el estado de un mensaje SALIENTE.
    // Un chat con entradas pendientes expone un contador accesible que incluye
    // una cantidad (por ejemplo: "2 mensajes no leídos").
    const details = unreadRowDetails(row);
    if (!details) return [];
    const { name, count: unreadCount, preview } = details;
    state.unreadCounts.set(chatKey(name), unreadCount);
    if (!preview) return [];
    const identity = `unread-chat|${chatKey(name)}|${unreadCount}|${preview}`;
    return [{ event_key: `${channel}|${identity}`, source_message_key: identity, unread_chat_preview: true, unread_count: unreadCount, channel, direction: 'inbound', chat_id: chatKey(name), chat_name: name, text_body: preview, occurred_at: new Date().toISOString() }];
  });
}

function messageDirection(node, metadata = '') {
  const container = node.closest('[data-id]') || node.querySelector('[data-id]');
  const dataId = container?.getAttribute('data-id') || '';
  const outgoingClass = node.matches?.('.message-out') || node.closest('.message-out') || node.querySelector?.('.message-out');
  const incomingClass = node.matches?.('.message-in') || node.closest('.message-in') || node.querySelector?.('.message-in');
  if (outgoingClass || /^(true|from_me)[_-]/i.test(dataId) || /\]\s*(tú|tu|you):/i.test(metadata)) return 'outbound';
  if (incomingClass || /^(false|received)[_-]/i.test(dataId)) return 'inbound';
  // No contaminar la memoria: si WhatsApp cambió su estructura y no hay una
  // prueba explícita de recepción, el mensaje se omite hasta poder clasificarlo.
  return 'unknown';
}

function senderFromMetadata(metadata = '') {
  const match = metadata.match(/\]\s*([^:]{1,120}):\s*$/);
  const sender = match?.[1]?.trim() || '';
  return /^(tú|tu|you)$/i.test(sender) ? '' : sender;
}

function messageText(node) {
  const copyable = node.querySelector('[data-pre-plain-text]') || node;
  const candidates = [
    ...(copyable.matches?.('.selectable-text, [data-testid="selectable-text"]') ? [copyable] : []),
    ...copyable.querySelectorAll('.selectable-text, [data-testid="selectable-text"]'),
  ]
    .filter((item) => !item.closest('[data-testid*="quoted"], [aria-label*="mensaje citado" i]'))
    .map((item) => item.innerText?.trim() || item.textContent?.trim())
    .filter(Boolean);
  return candidates.at(-1) || '';
}

function messageIdentity(node, metadata, text, direction, index) {
  // WhatsApp asigna un data-id distinto a cada mensaje, incluso cuando un cliente
  // repite exactamente el mismo texto. Usarlo evita que una consulta recurrente
  // quede confundida con otra que ya fue procesada o eliminada del CRM.
  const container = node.closest('[data-id]') || node.querySelector('[data-id]');
  const whatsappId = container?.getAttribute('data-id') || '';
  // Conserva el ID histórico cuando WhatsApp expone fecha/remitente, para no
  // reimportar conversaciones antiguas después de actualizar la extensión.
  // data-id es la identidad canónica del mensaje y no cambia aunque dos
  // agendas muestren nombres distintos para el mismo contacto.
  if (whatsappId) return `wa:${whatsappId}`;
  if (metadata) return `${direction}|${metadata}|${text}`;
  return `${direction}|${index}|${text}`;
}

function capture() {
  if (state.sending || state.stopped) return;
  if (!extensionAvailable()) return stopCapture(true);
  state.sending = true;
  safeStorageGet(['channel', 'endpoint', 'token'], (config) => {
    if (!config) { state.sending = false; return stopCapture(!extensionAvailable()); }
    if (!config.channel || !config.endpoint || !config.token) { state.sending = false; return; }
    const events = unreadPreviews(config.channel).filter((event) => !state.sent.has(event.event_key));
    const name = chatName();
    const group = openChatIsGroup();
    const allNodes = messageNodes();
    const diagnosticKey = `${name}|${group}|${allNodes.length}`;
    if (diagnosticKey !== state.lastDiagnosticKey) {
      state.lastDiagnosticKey = diagnosticKey;
      safeStorageSet({ lastScanAt: new Date().toISOString(), lastScanChat: name, lastScanNodes: allNodes.length, lastScanWasGroup: group });
    }
    if (name && !group && !openChatIsSelf(name)) {
      const nodes = allNodes.slice(-80);
      const currentChatKey = chatKey(name);
      const pendingMatches = state.pendingUnread && chatKey(state.pendingUnread.name) === currentChatKey;
      if (pendingMatches && Date.now() < state.pendingUnread.readyAt) {
        setTimeout(queueCapture, state.pendingUnread.readyAt - Date.now() + 50);
      } else {
      const firstVisit = !state.initializedChats.has(currentChatKey);
      const unreadCount = firstVisit ? (pendingMatches ? state.pendingUnread.count : state.unreadCounts.get(currentChatKey) || 0) : 0;
      const parsed = nodes.map((node, index) => {
        const text = messageText(node);
        if (!text) return null;
        const metadata = node.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
        const direction = messageDirection(node, metadata);
        if (direction === 'unknown') return null;
        const identity = messageIdentity(node, metadata, text, direction, index);
        const eventKey = `${config.channel}|${name}|${identity}`;
        return { text, direction, identity, eventKey, sender: senderFromMetadata(metadata) };
      }).filter(Boolean);
      const unreadInboundKeys = new Set(parsed.filter((item) => item.direction === 'inbound').slice(-unreadCount).map((item) => item.eventKey));
      for (const item of parsed) {
        const { text, direction, identity, eventKey, sender } = item;
        // La primera vez que vemos un chat establecemos una línea de base. No
        // importamos su historial ni mensajes enviados por el equipo. Si el chat
        // tenía mensajes pendientes, rescatamos únicamente esos últimos mensajes
        // entrantes cuando Felipe abre la conversación.
        if ((firstVisit && !unreadInboundKeys.has(eventKey)) || direction !== 'inbound') {
          state.sent.add(eventKey);
          continue;
        }
        if (state.sent.has(eventKey)) continue;
        const contactName = /^\+?[\d\s()-]+$/.test(name) && sender ? sender : name;
        events.push({ event_key: eventKey, source_message_key: identity, bridge_version: '0.18.1', channel: config.channel, direction, chat_id: chatKey(name), chat_name: contactName, text_body: text, occurred_at: new Date().toISOString() });
      }
      state.initializedChats.add(currentChatKey);
      if (unreadCount) state.unreadCounts.delete(currentChatKey);
      if (pendingMatches) state.pendingUnread = null;
      }
    }
    if (!events.length) { state.sending = false; return; }
    safeStorageSet({ lastDetectedAt: new Date().toISOString(), lastDetectedChat: name, lastDetectedEvents: events.length });
    safeSendEvents(events, (result) => {
      if (result?.ok) events.forEach((event) => state.sent.add(event.event_key));
      state.sending = false;
    });
  });
}

function startWhatsAppCapture() {
  state.observer = new MutationObserver(() => {
    clearTimeout(state.timer);
    state.timer = setTimeout(queueCapture, 500);
  });
  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  // WhatsApp puede actualizar contadores o mensajes sin una mutación útil en #main.
  // La revisión periódica hace que el puente se recupere solo después de suspensión,
  // cambio de pestaña o una actualización silenciosa de WhatsApp Web.
  state.interval = setInterval(queueCapture, 5000);
  window.addEventListener('focus', queueCapture);
  document.addEventListener('click', rememberUnreadClick, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueCapture();
  });
  queueCapture();
}
