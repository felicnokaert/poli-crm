const state = { authorized: new Set(), sent: new Set(), sending: false, observer: null, button: null, timer: null };

function chatName() {
  return document.querySelector('#main header [title]')?.getAttribute('title')
    || document.querySelector('#main header span[dir="auto"]')?.textContent?.trim()
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

async function capture() {
  if (state.sending) return;
  const name = chatName();
  if (!name || !state.authorized.has(chatKey(name))) return;
  const config = await chrome.storage.local.get(['channel', 'endpoint', 'token']);
  if (!config.channel || !config.endpoint || !config.token) return;

  const events = [];
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
  if (!events.length) return;
  state.sending = true;
  try {
    const response = await fetch(config.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
    if (response.ok) events.forEach((event) => state.sent.add(event.event_id));
  } finally {
    state.sending = false;
    updateButton();
  }
}

function updateButton() {
  if (!state.button) return;
  const active = state.authorized.has(chatKey(chatName()));
  state.button.textContent = active ? 'Copiloto ON' : 'Activar copiloto';
  state.button.dataset.active = active ? 'true' : 'false';
}

function mountButton() {
  const header = document.querySelector('#main header');
  if (!header || state.button?.isConnected) return;
  const button = document.createElement('button');
  button.id = 'poliplast-copilot-toggle';
  button.type = 'button';
  button.style.cssText = 'margin:8px;padding:7px 10px;border:1px solid #0d7764;border-radius:8px;background:#fff;color:#0d7764;font:600 12px system-ui;cursor:pointer;z-index:20';
  button.addEventListener('click', async () => {
    const key = chatKey(chatName());
    if (!key) return;
    state.authorized.has(key) ? state.authorized.delete(key) : state.authorized.add(key);
    await chrome.storage.local.set({ authorizedChats: [...state.authorized] });
    updateButton();
    capture();
  });
  header.append(button);
  state.button = button;
  updateButton();
}

chrome.storage.local.get(['authorizedChats'], ({ authorizedChats = [] }) => {
  state.authorized = new Set(authorizedChats);
  state.observer = new MutationObserver(() => {
    mountButton();
    updateButton();
    clearTimeout(state.timer);
    state.timer = setTimeout(capture, 450);
  });
  state.observer.observe(document.body, { childList: true, subtree: true });
  mountButton();
});
