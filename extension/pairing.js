// Este script solo conecta la pantalla de configuración del CRM con el
// almacenamiento privado de la extensión. No inspecciona conversaciones.
globalThis.addEventListener('unhandledrejection', (event) => {
  const message = String(event.reason?.message || event.reason || '');
  if (/Extension context invalidated/i.test(message)) event.preventDefault();
});

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'POLIPLAST_BRIDGE_CONFIG') return;
  const { channel, endpoint, token } = event.data;
  if (!['general', 'penosil'].includes(channel) || !endpoint || !token) return;
  try {
    const operation = chrome.storage.local.set({
      channel,
      endpoint,
      token,
      pairedAt: new Date().toISOString(),
      lastError: '',
    }, () => {
      try {
        if (chrome.runtime.lastError) return;
        window.postMessage({ type: 'POLIPLAST_BRIDGE_PAIRED', channel }, location.origin);
      } catch { /* la pestaña se recargó durante la vinculación */ }
    });
    if (operation && typeof operation.catch === 'function') operation.catch(() => {});
  } catch { /* la extensión fue actualizada con la pestaña abierta */ }
});

window.postMessage({ type: 'POLIPLAST_BRIDGE_READY' }, location.origin);
