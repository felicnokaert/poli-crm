const channel = document.querySelector('#channel');
const chat = document.querySelector('#chat');
const detected = document.querySelector('#detected');
const attempt = document.querySelector('#attempt');
const success = document.querySelector('#success');
const queuedElement = document.querySelector('#queued');
const status = document.querySelector('#status');

chrome.storage.local.get(['channel', 'lastChatName', 'lastSuccessAt', 'lastError', 'pendingEvents', 'lastDetectedAt', 'lastDetectedChat', 'lastAttemptAt'], (data) => {
  channel.textContent = data.channel === 'penosil' ? 'Penosil' : data.channel === 'general' ? 'General' : 'Sin vincular';
  chat.textContent = data.lastChatName || 'Todavía ninguno';
  detected.textContent = data.lastDetectedAt ? `${data.lastDetectedChat || 'Chat'} · ${new Date(data.lastDetectedAt).toLocaleTimeString('es-AR')}` : 'Todavía ninguno';
  attempt.textContent = data.lastAttemptAt ? new Date(data.lastAttemptAt).toLocaleString('es-AR') : 'Todavía ninguno';
  success.textContent = data.lastSuccessAt ? new Date(data.lastSuccessAt).toLocaleString('es-AR') : 'Todavía ninguno';
  const queued = data.pendingEvents?.length || 0;
  queuedElement.textContent = String(queued);
  status.textContent = data.lastError ? `${data.lastError}${queued ? ` · ${queued} en espera` : ''}` : (data.channel ? 'Listo' : 'Abrí el CRM y vinculá este perfil');
  status.className = `value ${data.lastError || !data.channel ? 'warn' : 'ok'}`;
});

document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
