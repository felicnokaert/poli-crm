import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asksBusiness, businessContext, businessFacts } from '../src/assistant-business.mjs';

test('números del negocio: entiende la pregunta y arma el contexto con cotizaciones y atrasados', () => {
  assert.ok(asksBusiness('¿cuántas cotizaciones cerramos?'));
  assert.ok(asksBusiness('qué clientes están atrasados'));
  assert.ok(asksBusiness('a quién llamo hoy para reactivar'));
  assert.ok(!asksBusiness('cuánto rinde el easyspray'));
  const rows = [
    { company: 'POLIPLAST', tipo: 'COT', fecha: '2026-06-01', cliente: 'ACME SA', total: 100 },
    { company: 'POLIPLAST', tipo: 'FCA', fecha: '2026-06-10', cliente: 'ACME SA', total: 100 },
  ];
  for (const fecha of ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']) rows.push({ company: 'POLIPLAST', tipo: 'FCA', fecha, cliente: 'Beta SRL', total: 50 });
  const clients = [{ id: 'a', company: 'ACME' }, { id: 'b', company: 'Beta' }];
  const facts = businessFacts(rows, clients, '2026-10-01');
  assert.equal(facts.quotes.closed, 1);
  assert.deepEqual(facts.overdue.map((item) => item.client.company), ['Beta']);
  const text = businessContext(facts);
  assert.match(text, /NÚMEROS DEL NEGOCIO/);
  assert.match(text, /se cierra el 100 %/);
  assert.match(text, /Beta \(compra cada ~\d+ días/);
});
