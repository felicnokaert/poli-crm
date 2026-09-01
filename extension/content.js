// Chrome invalida el mundo aislado anterior cuando una extensión sin empaquetar
// se recarga. Esa condición es esperable y no representa una falla del puente.
// Evitamos que quede registrada como un error persistente, pero conservamos
// cualquier otro rechazo para no esconder problemas reales.
globalThis.addEventListener('unhandledrejection', (event) => {
  const message = String(event.reason?.message || event.reason || '');
  if (/Extension context invalidated/i.test(message)) event.preventDefault();
});

const state = { sent: new Set(), sending: false, stopped: false, observer: null, timer: null, interval: null };

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
  return document.querySelector('#main header span[dir="auto"]')?.textContent?.trim()
    || '';
}

function chatKey(name) { return name.toLocaleLowerCase('es-AR'); }

function messageNodes() {
  return [...document.querySelectorAll('#main .message-in, #main .message-out')];
}

function openChatIsGroup() {
  const header = document.querySelector('#main header');
  if (!header) return false;
  return Boolean(header.querySelector('button[aria-label*="grupo" i]'))
    || /información del grupo/i.test(header.innerText || '');
}

function messageText(node) {
  const copyable = node.querySelector('[data-pre-plain-text]') || node;
  const candidates = [...copyable.querySelectorAll('.selectable-text, [data-testid="selectable-text"]')]
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
    const events = [];
    const name = chatName();
    if (name && !openChatIsGroup()) {
      const nodes = messageNodes().slice(-80);
      for (const [index, node] of nodes.entries()) {
        const text = messageText(node);
        if (!text) continue;
        const direction = node.closest('.message-out') || node.classList.contains('message-out') ? 'outbound' : 'inbound';
        const metadata = node.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
        const identity = messageIdentity(node, metadata, text, direction, index);
        const eventKey = `${config.channel}|${name}|${identity}`;
        if (state.sent.has(eventKey)) continue;
        events.push({ event_key: eventKey, channel: config.channel, direction, chat_id: chatKey(name), chat_name: name, text_body: text, occurred_at: new Date().toISOString() });
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueCapture();
  });
  queueCapture();
}
