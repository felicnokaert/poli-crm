import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { normalizeWebhook, verifyMetaSignature } from '../lib/whatsapp.mjs';

test('validates Meta webhook signatures', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = 'test-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(body, 'sha256=bad', secret), false);
});

test('normalizes inbound WhatsApp messages', () => {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'general-id', display_phone_number: '541152627555' },
      contacts: [{ wa_id: '5491112345678', profile: { name: 'Cliente prueba' } }],
      messages: [{ id: 'wamid.1', from: '5491112345678', timestamp: '1787904000', type: 'text', text: { body: 'Necesito una cotización' } }],
    } }] }],
  };
  const [event] = normalizeWebhook(payload, { 'general-id': 'general' });
  assert.equal(event.channel, 'general');
  assert.equal(event.customer_name, 'Cliente prueba');
  assert.equal(event.text_body, 'Necesito una cotización');
  assert.equal(event.classification_status, 'pending');
});

