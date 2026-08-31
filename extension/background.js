chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'POLIPLAST_BRIDGE_EVENTS' || !Array.isArray(message.events)) return false;
  chrome.storage.local.get(['endpoint', 'token'], async ({ endpoint, token }) => {
    if (!endpoint || !token) {
      sendResponse({ ok: false, error: 'Conector sin vincular.' });
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: message.events }),
      });
      sendResponse({ ok: response.ok });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  });
  return true;
});
