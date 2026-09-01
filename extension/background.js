const MAX_QUEUE = 200;

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

async function normalizeEvents(events = []) {
  return Promise.all(events.map(async (event) => ({
    ...event,
    event_id: event.event_id || `bridge.open.${await digest(event.event_key || '')}`,
    event_key: undefined,
  })));
}

function uniqueEvents(items = []) {
  return [...new Map(items.filter((item) => item?.event_id).map((item) => [item.event_id, item])).values()].slice(-MAX_QUEUE);
}

async function postEvents(endpoint, token, events) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, ...payload };
      lastError = new Error(payload.error || `Servidor respondió ${response.status}`);
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 700));
  }
  throw lastError || new Error('No se pudo conectar con el CRM.');
}

async function deliver(incoming) {
  const stored = await chrome.storage.local.get(['endpoint', 'token', 'pendingEvents']);
  const normalized = await normalizeEvents(incoming);
  const events = uniqueEvents([...(stored.pendingEvents || []), ...normalized]);
  if (!stored.endpoint || !stored.token) {
    await chrome.storage.local.set({ pendingEvents: events, lastError: 'Conector sin vincular.', lastAttemptAt: new Date().toISOString() });
    return { ok: false, queued: events.length, error: 'Conector sin vincular.' };
  }

  const attemptAt = new Date().toISOString();
  try {
    const payload = await postEvents(stored.endpoint, stored.token, events);
    await chrome.storage.local.set({
      pendingEvents: [],
      lastAttemptAt: attemptAt,
      lastSuccessAt: new Date().toISOString(),
      lastError: '',
      lastAccepted: payload.accepted ?? events.length,
      lastStored: payload.stored ?? 0,
      lastChatName: events.at(-1)?.chat_name || '',
    });
    return { ok: true, ...payload };
  } catch (error) {
    await chrome.storage.local.set({ pendingEvents: events, lastError: error.message, lastAttemptAt: attemptAt });
    return { ok: false, queued: events.length, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'POLIPLAST_BRIDGE_EVENTS' || !Array.isArray(message.events)) return false;
  deliver(message.events).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
