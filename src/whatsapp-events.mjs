export function isTrustedWhatsAppEvent(event) {
  const id = String(event?.event_id || '');
  return !id.startsWith('bridge.') || id.startsWith('bridge.open.');
}
