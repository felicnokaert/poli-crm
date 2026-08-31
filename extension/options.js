const channel = document.querySelector('#channel');
const endpoint = document.querySelector('#endpoint');
const token = document.querySelector('#token');
const status = document.querySelector('#status');

chrome.storage.local.get(['channel', 'endpoint', 'token'], (stored) => {
  channel.value = stored.channel || 'general';
  endpoint.value = stored.endpoint || endpoint.value;
  token.value = stored.token || '';
});

document.querySelector('#save').addEventListener('click', () => {
  chrome.storage.local.set({ channel: channel.value, endpoint: endpoint.value.trim(), token: token.value.trim() }, () => {
    status.textContent = 'Configuración guardada. Volvé a WhatsApp Web.';
  });
});
