chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'POLIPLAST_BRIDGE_EVENTS' || !Array.isArray(message.events)) return false;
  chrome.storage.local.get(['endpoint', 'token'], async ({ endpoint, token }) => {
    if (!endpoint || !token) {
      await chrome.storage.local.set({ lastError: 'Conector sin vincular.', lastAttemptAt: new Date().toISOString() });
      sendResponse({ ok: false, error: 'Conector sin vincular.' });
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: message.events }),
      });
      const payload = await response.json().catch(() => ({}));
      const status = {
        lastAttemptAt: new Date().toISOString(),
        lastError: response.ok ? '' : (payload.error || `Servidor respondió ${response.status}`),
      };
      if (response.ok) {
        status.lastSuccessAt = status.lastAttemptAt;
        status.lastAccepted = payload.accepted ?? message.events.length;
        status.lastStored = payload.stored ?? 0;
        status.lastChatName = message.events.at(-1)?.chat_name || '';
      }
      await chrome.storage.local.set(status);
      sendResponse({ ok: response.ok, ...payload });
    } catch (error) {
      await chrome.storage.local.set({ lastError: error.message, lastAttemptAt: new Date().toISOString() });
      sendResponse({ ok: false, error: error.message });
    }
  });
  return true;
});
