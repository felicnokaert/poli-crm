export function isTrustedWhatsAppEvent(event) {
  const id = String(event?.event_id || '');
  return !id.startsWith('bridge.') || id.startsWith('bridge.open.');
}

export function isLegacyWhatsAppPreview(event) {
  return !isTrustedWhatsAppEvent(event);
}

export function filterDismissedEvents(events = [], dismissedIds = []) {
  const dismissed = new Set(dismissedIds);
  return events.filter((event) => !dismissed.has(event?.event_id));
}
