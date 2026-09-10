import assert from 'node:assert/strict';
import test from 'node:test';
import { attachWhatsAppContact, classifyClientContactByWhatsApp, clientContacts, duplicatePhoneSignals, findClientByWhatsApp, removeClientContact, setPrimaryClientContact, updateClientContact, withClientContact } from '../src/client-contacts.mjs';

test('keeps several people and phone numbers under one company', () => {
  let client = { id: 'a', company: 'Empresa A' };
  client = withClientContact(client, { name: 'Ana', phone: '11 5555-0001' });
  client = withClientContact(client, { name: 'Carlos', phone: '11 5555-0002' });
  assert.equal(clientContacts(client).length, 2);
  assert.equal(client.contact, 'Ana');
});

test('classifies only the matching person as non-commercial and can restore it', () => {
  let client = withClientContact({ id: 'a', company: 'Empresa A' }, { name: 'Ana', phone: '11 5555-0001' });
  client = withClientContact(client, { name: 'Carlos', phone: '11 5555-0002' });
  client = classifyClientContactByWhatsApp(client, { customer_wa_id: '5491155550002' }, 'Proveedor / colaborador');
  assert.equal(clientContacts(client).find((item) => item.name === 'Carlos').nonCommercialCategory, 'Proveedor / colaborador');
  assert.equal(clientContacts(client).find((item) => item.name === 'Ana').commercialStatus, 'commercial');
  client = classifyClientContactByWhatsApp(client, { customer_wa_id: '5491155550002' }, '');
  assert.equal(clientContacts(client).find((item) => item.name === 'Carlos').commercialStatus, 'commercial');
  assert.equal(clientContacts(client).find((item) => item.name === 'Carlos').nonCommercialCategory, '');
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

test('edits, selects and removes contacts while keeping legacy primary fields synchronized', () => {
  let client = withClientContact({ id: 'a', company: 'Empresa A' }, { name: 'Ana', phone: '111' });
  client = withClientContact(client, { name: 'Carlos', phone: '222' });
  const carlos = clientContacts(client).find((item) => item.name === 'Carlos');
  client = updateClientContact(client, carlos.id, { role: 'Compras', email: 'carlos@empresa.com' });
  client = setPrimaryClientContact(client, carlos.id);
  assert.equal(client.contact, 'Carlos');
  assert.equal(client.phone, '222');
  assert.equal(client.email, 'carlos@empresa.com');
  assert.equal(clientContacts(client).find((item) => item.name === 'Carlos').role, 'Compras');

  client = removeClientContact(client, carlos.id);
  assert.equal(clientContacts(client).length, 1);
  assert.equal(client.contact, 'Ana');
  assert.equal(client.phone, '111');
});
