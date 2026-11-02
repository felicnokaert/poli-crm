import test from 'node:test';
import assert from 'node:assert/strict';
import { isIgnoredWhatsAppContact } from '../src/whatsapp-threads.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';

const rule = { key: 'k1', customerWaId: '5491125644928', customerName: 'Felipe', category: 'Familiar / personal', updatedAt: '2026-11-03T10:00:00Z' };
const event = { customer_wa_id: '5491125644928', customer_name: 'Felipe' };

test('una regla quitada ya no excluye al contacto', () => {
  assert.equal(isIgnoredWhatsAppContact([rule], event), true);
  assert.equal(isIgnoredWhatsAppContact([{ ...rule, removed: true }], event), false);
});

test('«Corregir: es cliente» no vuelve con la fusión con la copia en línea', () => {
  const local = { ignoredWhatsAppContacts: [{ ...rule, removed: true, updatedAt: '2026-11-03T12:00:00Z' }] };
  const remote = { ignoredWhatsAppContacts: [rule] };
  const merged = mergeWorkspaceState(local, remote);
  assert.equal(isIgnoredWhatsAppContact(merged.ignoredWhatsAppContacts, event), false);
});
