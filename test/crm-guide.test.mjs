import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchKnowledge } from '../src/knowledge-search.mjs';
import { guideItems } from '../src/crm-guide.mjs';

test('el asistente sabe para qué sirve cada pantalla y el contacto de cada cliente', () => {
  const sources = { help: guideItems(), clients: [{ id: 'c1', company: 'Lavopa Rolando', contact: 'Rolando', phone: '11 5555-0000', email: 'r@x.com' }] };
  const help = searchKnowledge('¿De qué me sirve Prospección?', sources).groups.ayuda;
  assert.equal(help[0].title, 'Prospección');
  assert.match(help[0].snippet, /Cola del día/);
  assert.equal(searchKnowledge('dónde veo el último precio', sources).groups.ayuda[0].title, 'Ventas');
  const client = searchKnowledge('contacto de Lavopa', sources).groups.clientes[0];
  assert.match(client.snippet, /Tel: 11 5555-0000/);
});
