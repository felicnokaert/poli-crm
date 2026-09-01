const channel = document.querySelector('#channel');
const chat = document.querySelector('#chat');
const success = document.querySelector('#success');
const status = document.querySelector('#status');

chrome.storage.local.get(['channel', 'lastChatName', 'lastSuccessAt', 'lastError', 'pendingEvents'], (data) => {
  channel.textContent = data.channel === 'penosil' ? 'Penosil' : data.channel === 'general' ? 'General' : 'Sin vincular';
  chat.textContent = data.lastChatName || 'Todavía ninguno';
  success.textContent = data.lastSuccessAt ? new Date(data.lastSuccessAt).toLocaleString('es-AR') : 'Todavía ninguno';
  const queued = data.pendingEvents?.length || 0;
  status.textContent = data.lastError ? `${data.lastError}${queued ? ` · ${queued} en espera` : ''}` : (data.channel ? 'Listo' : 'Abrí el CRM y vinculá este perfil');
  status.className = `value ${data.lastError || !data.channel ? 'warn' : 'ok'}`;
});
