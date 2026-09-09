export function isTrustedWhatsAppEvent(event) {
  const id = String(event?.event_id || '');
  return !id.startsWith('bridge.') || id.startsWith('bridge.open.');
}

export function isLegacyWhatsAppPreview(event) {
  if (!isTrustedWhatsAppEvent(event)) return true;
  const bridgeVersion = String(event?.raw_payload?.bridge_version || '');
  const browserPenosil = event?.channel === 'penosil' && String(event?.phone_number_id || '').startsWith('browser-bridge:');
  // Las versiones anteriores a 0.17 podían confundir salientes, nombres y
  // canales. Se conservan en cuarentena, pero no alimentan la bandeja diaria.
  // Sin bridge_version (string vacío) se trata como versión desconocida, no
  // como "versión actual" - si no sabemos qué la generó, no es de fiar.
  if (browserPenosil && compareVersions(bridgeVersion || '0', '0.17.0') < 0) return true;
  return false;
}

function compareVersions(left, right) {
  const parts = (value) => String(value).split('.').map((item) => Number(item) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

export function filterDismissedEvents(events = [], dismissedIds = []) {
  const dismissed = new Set(dismissedIds);
  return events.filter((event) => !dismissed.has(event?.event_id));
}

export function isLowSignalWhatsAppEvent(event = {}) {
  const type = String(event?.message_type || '').toLowerCase();
  const text = String(event?.text_body || '').trim();
  if (['reaction', 'unsupported', 'status'].includes(type)) return true;
  if (/^\[(reaction|unsupported)\]$/i.test(text)) return true;
  return /gracias por comunicarte.{0,180}(horario|tan pronto como|fuera de horario)/i.test(text);
}
