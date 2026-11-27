import test from 'node:test';
import assert from 'node:assert/strict';
import { askText, contabiliumWithoutEmail, emailsOfClient, groupByVendor, myClientsWithoutEmail, contabiliumIndex, normalizeEmail, splitEmails } from '../src/client-emails.mjs';

test('normaliza y descarta mails falsos', () => {
  assert.equal(normalizeEmail(' Compras@Empresa.com.ar '), 'compras@empresa.com.ar');
  assert.equal(normalizeEmail('sinmail@sinmail.com'), '');
  assert.equal(normalizeEmail('noreply@x.com'), '');
  assert.equal(normalizeEmail('no tiene'), '');
  assert.deepEqual(splitEmails('a@x.com; b@y.com, a@x.com'), ['a@x.com', 'b@y.com']);
});

test('mails de la ficha: email, contactos y extraEmails', () => {
  assert.deepEqual(emailsOfClient({ contacts: [{ name: 'Ana', email: 'ana@x.com' }], extraEmails: ['compras@x.com'] }), ['ana@x.com', 'compras@x.com']);
  assert.deepEqual(emailsOfClient({ company: 'X', phone: '11' }), []);
});

test('mi cartera sin mail sugiere el de Contabilium por CUIT', () => {
  const index = contabiliumIndex([{ company: 'POLIPLAST', id: 1, razon_social: 'Foo SRL', cuit: '30-71111111-1', email: 'foo@foo.com' }]);
  const rows = myClientsWithoutEmail([
    { id: 'a', company: 'Foo S.R.L.', cuit: '30711111111' },
    { id: 'b', company: 'Bar', email: 'bar@bar.com' },
    { id: 'c', company: 'Zeta' },
  ], index);
  assert.deepEqual(rows.map((row) => [row.id, row.suggested]), [['a', 'foo@foo.com'], ['c', '']]);
});

test('Contabilium: último FC/COT por cliente, sin mail, por vendedor', () => {
  const clients = [
    { company: 'POLIPLAST', id: 1, razon_social: 'Uno SA', cuit: '30700000001', email: '' },
    { company: 'POLIPLAST', id: 2, razon_social: 'Dos SA', cuit: '', email: 'dos@dos.com' },
    { company: 'POLIPLAST', id: 3, razon_social: 'Tres SA', cuit: '30700000003', email: '' },
    { company: 'FOAMFACTORY', id: 9, razon_social: 'Tres SA', cuit: '30700000003', email: 'tres@tres.com' },
  ];
  const invoices = [
    { company: 'POLIPLAST', cliente_id: 1, tipo: 'FCA', fecha: '2026-10-01', vendedor: '25011' },
    { company: 'POLIPLAST', cliente_id: 1, tipo: 'COT', fecha: '2026-11-01', vendedor: '34829' },
    { company: 'POLIPLAST', cliente_id: 2, tipo: 'FCB', fecha: '2026-11-02', vendedor: '25011' },
    { company: 'POLIPLAST', cliente_id: 3, tipo: 'FCA', fecha: '2026-11-03', vendedor: '25011' },
    { company: 'POLIPLAST', cliente_id: 4, tipo: 'FCA', fecha: '2026-11-03', vendedor: '25011' },
    { company: 'POLIPLAST', cliente_id: 1, tipo: 'NCA', fecha: '2026-11-20', vendedor: '1' },
  ];
  const result = contabiliumWithoutEmail({ invoices, clients, vendorNames: { 34829: 'Brenda' } });
  assert.equal(result.total, 4);
  assert.equal(result.withEmail, 1);
  assert.equal(result.noFicha, 1);
  assert.deepEqual(result.rows.map((row) => [row.clienteId, row.vendorName, row.suggested]), [[3, 'Vendedor 25011', 'tres@tres.com'], [1, 'Brenda', '']]);
  const groups = groupByVendor(result.rows);
  assert.equal(groups.length, 2);
  assert.match(askText(groups.find((group) => group.name === 'Brenda')), /Hola Brenda.*\n• Uno SA \(CUIT 30700000001\)/);
});
