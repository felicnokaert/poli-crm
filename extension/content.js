const state = { sent: new Set(), sending: false, observer: null, timer: null };

if (location.hostname === 'poli-crm.vercel.app') {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'POLIPLAST_BRIDGE_CONFIG') return;
    const { channel, endpoint, token } = event.data;
    if (!['general', 'penosil'].includes(channel) || !endpoint || !token) return;
    chrome.storage.local.set({ channel, endpoint, token, pairedAt: new Date().toISOString() }, () => {
      window.postMessage({ type: 'POLIPLAST_BRIDGE_PAIRED', channel }, location.origin);
    });
  });
} else {
  startWhatsAppCapture();
}

function chatName() {
  return document.querySelector('#main header span[dir="auto"]')?.textContent?.trim()
    || '';
}

function chatKey(name) { return name.toLocaleLowerCase('es-AR'); }

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

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

async function capture() {
  if (state.sending) return;
  const config = await chrome.storage.local.get(['channel', 'endpoint', 'token']);
  if (!config.channel || !config.endpoint || !config.token) return;
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
      const eventId = `bridge.open.${await digest(`${config.channel}|${name}|${identity}`)}`;
      if (state.sent.has(eventId)) continue;
      events.push({ event_id: eventId, channel: config.channel, direction, chat_id: chatKey(name), chat_name: name, text_body: text, occurred_at: new Date().toISOString() });
    }
  }
  if (!events.length) return;
  state.sending = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'POLIPLAST_BRIDGE_EVENTS', events });
    if (result?.ok) events.forEach((event) => state.sent.add(event.event_id));
  } finally {
    state.sending = false;
  }
}

function startWhatsAppCapture() {
  state.observer = new MutationObserver(() => {
    clearTimeout(state.timer);
    state.timer = setTimeout(capture, 500);
  });
  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  // WhatsApp puede actualizar contadores o mensajes sin una mutación útil en #main.
  // La revisión periódica hace que el puente se recupere solo después de suspensión,
  // cambio de pestaña o una actualización silenciosa de WhatsApp Web.
  setInterval(capture, 5000);
  window.addEventListener('focus', capture);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') capture();
  });
  capture();
}
