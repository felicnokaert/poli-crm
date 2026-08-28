import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const received = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

export function normalizeWebhook(payload, phoneMap = {}) {
  const events = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id || '';
      const channel = phoneMap[phoneNumberId] || 'unknown';
      const contactNames = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || '']));

      for (const message of value.messages || []) {
        events.push({
          event_id: message.id,
          phone_number_id: phoneNumberId,
          display_phone_number: value?.metadata?.display_phone_number || '',
          channel,
          direction: 'inbound',
          customer_wa_id: message.from || '',
          customer_name: contactNames.get(message.from) || '',
          message_type: message.type || 'unknown',
          text_body: message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '',
          occurred_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          classification_status: 'pending',
          raw_payload: message,
        });
      }

      for (const status of value.statuses || []) {
        events.push({
          event_id: `${status.id}:${status.status}`,
          phone_number_id: phoneNumberId,
          display_phone_number: value?.metadata?.display_phone_number || '',
          channel,
          direction: 'status',
          customer_wa_id: status.recipient_id || '',
          customer_name: '',
          message_type: status.status || 'unknown',
          text_body: '',
          occurred_at: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
          classification_status: 'system',
          raw_payload: status,
        });
      }
    }
  }
  return events;
}

