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
  return [...document.querySelectorAll('#main [data-id]')].filter((node) =>
    node.querySelector('.selectable-text, [data-testid="selectable-text"]') || node.matches('.message-in, .message-out'));
}

function openChatIsGroup() {
  const header = document.querySelector('#main header');
  if (!header) return false;
  return Boolean(header.querySelector('button[aria-label*="grupo" i]'))
    || /información del grupo/i.test(header.innerText || '');
}

function listRowIsGroup(row) {
  const lines = (row.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.some((line) => line === ':' || line === ': ');
}

async function capture() {
  if (state.sending) return;
  const config = await chrome.storage.local.get(['channel', 'endpoint', 'token']);
  if (!config.channel || !config.endpoint || !config.token) return;
  const events = [];
  const name = chatName();
  if (name && !openChatIsGroup()) {
    for (const node of messageNodes().slice(-80)) {
      const text = [...node.querySelectorAll('.selectable-text, [data-testid="selectable-text"]')]
        .map((item) => item.textContent).join('\n').trim();
      if (!text) continue;
      const direction = node.closest('.message-out') || node.classList.contains('message-out') ? 'outbound' : 'inbound';
      const metadata = node.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
      const eventId = `bridge.${await digest(`${config.channel}|${name}|${direction}|${metadata}|${text}`)}`;
      if (state.sent.has(eventId)) continue;
      events.push({ event_id: eventId, channel: config.channel, direction, chat_id: chatKey(name), chat_name: name, text_body: text, occurred_at: new Date().toISOString() });
    }
  }
  const chatRows = [...document.querySelectorAll('[role="grid"] [role="row"]')].filter((row) =>
    row.querySelector('[aria-label*="mensaje no leído"], [aria-label*="mensajes no leídos"]') && !listRowIsGroup(row));
  for (const row of chatRows.slice(0, 30)) {
    const parts = [...row.querySelectorAll('span[dir="auto"]')].map((item) => item.textContent?.trim()).filter(Boolean);
    const rowName = parts[0] || row.querySelector('[title]')?.getAttribute('title') || '';
    const preview = parts.at(-1) || '';
    if (!rowName || !preview || rowName === preview) continue;
    const direction = /(^|\s)Tú\s*:/i.test(row.innerText) ? 'outbound' : 'inbound';
    const eventId = `bridge.${await digest(`${config.channel}|preview|${rowName}|${direction}|${preview}`)}`;
    if (state.sent.has(eventId)) continue;
    events.push({ event_id: eventId, channel: config.channel, direction, chat_id: chatKey(rowName), chat_name: rowName, text_body: preview, occurred_at: new Date().toISOString() });
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
  capture();
}
