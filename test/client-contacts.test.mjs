import assert from 'node:assert/strict';
import test from 'node:test';
import { attachWhatsAppContact, clientContacts, duplicatePhoneSignals, findClientByWhatsApp, withClientContact } from '../src/client-contacts.mjs';

test('keeps several people and phone numbers under one company', () => {
  let client = { id: 'a', company: 'Empresa A' };
  client = withClientContact(client, { name: 'Ana', phone: '11 5555-0001' });
  client = withClientContact(client, { name: 'Carlos', phone: '11 5555-0002' });
  assert.equal(clientContacts(client).length, 2);
  assert.equal(client.contact, 'Ana');
});

test('matches a WhatsApp id against any company contact', () => {
  const client = withClientContact({ id: 'a', company: 'Empresa A' }, { name: 'Ana', phone: '11 5555-0001' });
  const enriched = attachWhatsAppContact(client, { customer_name: 'Carlos', customer_wa_id: '5491155550002', channel: 'general' });
  assert.equal(findClientByWhatsApp([enriched], { customer_wa_id: '5491155550002' }).id, 'a');
});

test('flags a shared phone across different companies without merging them', () => {
  const first = withClientContact({ id: 'a', company: 'Zatti Sebastian' }, { phone: '3435118264' });
  const second = withClientContact({ id: 'b', company: 'Tecno Pur' }, { phone: '3435118264' });
  assert.equal(duplicatePhoneSignals([first, second]).length, 1);
});
