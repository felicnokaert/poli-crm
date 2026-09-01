// Chrome invalida el mundo aislado anterior cuando una extensión sin empaquetar
// se recarga. Esa condición es esperable y no representa una falla del puente.
// Evitamos que quede registrada como un error persistente, pero conservamos
// cualquier otro rechazo para no esconder problemas reales.
globalThis.addEventListener('unhandledrejection', (event) => {
  const message = String(event.reason?.message || event.reason || '');
  if (/Extension context invalidated/i.test(message)) event.preventDefault();
});

const state = { sent: new Set(), initializedChats: new Set(), sending: false, stopped: false, observer: null, timer: null, interval: null, lastDiagnosticKey: '' };

function extensionAvailable() {
  try { return Boolean(chrome?.runtime?.id); } catch { return false; }
}

function stopCapture() {
  state.stopped = true;
  state.observer?.disconnect();
  clearTimeout(state.timer);
  clearInterval(state.interval);
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
  try { capture(); } catch { if (!extensionAvailable()) stopCapture(); }
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

function unreadPreviews(channel) {
  const rows = [...document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')];
  return rows.flatMap((row) => {
    const unread = row.querySelector('[aria-label*="no leído" i], [aria-label*="no leídos" i], [aria-label*="unread" i]');
    if (!unread) return [];
    const titled = [...row.querySelectorAll('span[title]')].map((item) => item.getAttribute('title')?.trim()).filter(Boolean);
    const name = titled[0] || row.querySelector('span[dir="auto"]')?.textContent?.trim() || '';
    if (!name || openChatIsSelf(name)) return [];
    const texts = [...row.querySelectorAll('span[dir="auto"]')].map((item) => item.textContent?.trim()).filter(Boolean);
    const preview = [...texts].reverse().find((text) => text !== name && !/^\d{1,2}:\d{2}$/.test(text)) || '[mensaje no leído]';
    const identity = `unread-preview|${chatKey(name)}|${preview}`;
    return [{ event_key: `${channel}|${identity}`, source_message_key: identity, preview_only: true, channel, direction: 'inbound', chat_id: chatKey(name), chat_name: name, text_body: preview, occurred_at: new Date().toISOString() }];
  });
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
  if (metadata) return `${direction}|${metadata}|${text}`;
  return whatsappId ? `wa:${whatsappId}` : `${direction}|${index}|${text}`;
}

function capture() {
  if (state.sending || state.stopped) return;
  if (!extensionAvailable()) return stopCapture();
  state.sending = true;
  safeStorageGet(['channel', 'endpoint', 'token'], (config) => {
    if (!config) { state.sending = false; return stopCapture(); }
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
      const firstVisit = !state.initializedChats.has(chatKey(name));
      for (const [index, node] of nodes.entries()) {
        const text = messageText(node);
        if (!text) continue;
        const dataId = (node.closest('[data-id]') || node.querySelector('[data-id]'))?.getAttribute('data-id') || '';
        const direction = node.closest('.message-out') || node.classList.contains('message-out') || /^true[_-]/i.test(dataId) ? 'outbound' : 'inbound';
        const metadata = node.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
        const identity = messageIdentity(node, metadata, text, direction, index);
        const eventKey = `${config.channel}|${name}|${identity}`;
        // La primera vez que vemos un chat establecemos una línea de base. No
        // importamos su historial ni mensajes enviados por el equipo.
        if (firstVisit || direction !== 'inbound') {
          state.sent.add(eventKey);
          continue;
        }
        if (state.sent.has(eventKey)) continue;
        events.push({ event_key: eventKey, source_message_key: identity, channel: config.channel, direction, chat_id: chatKey(name), chat_name: name, text_body: text, occurred_at: new Date().toISOString() });
      }
      state.initializedChats.add(chatKey(name));
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueCapture();
  });
  queueCapture();
}
