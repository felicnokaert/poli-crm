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

test('el asistente encuentra lo pegado de Mercado Libre → Competencia', () => {
  const mlReports = [{ id: 'r1', section: 'Competencia', account: 'POLIPLAST SRL', created_at: '2026-10-22T10:00:00Z', content: 'Ranking Espumas Expansivas: 1. Sika Boom 2. Penosil Easyspray 3. Fischer' }];
  const [item] = searchKnowledge('competencia espumas sika', { mlReports }).groups.competencia;
  assert.equal(item.title, 'Mercado Libre · Competencia (POLIPLAST SRL)');
  assert.match(item.snippet, /Sika Boom/);
  assert.equal(item.subtitle, 'pegado el 22/10/2026');
});

test('sabe los requisitos de los clips de Mercado Libre', () => {
  const [item] = searchKnowledge('requisitos para subir un clip', { help: guideItems() }).groups.ayuda;
  assert.equal(item.title, 'Clips de Mercado Libre: requisitos');
  assert.match(item.snippet, /10 a 60 segundos/);
});

test('lo que más coincide va primero (no las fichas que solo nombran la palabra)', () => {
  const docs = [{ id: 'd1', title: 'Airless 390', status: 'vigente', extracted_text: 'Requisitos eléctricos del equipo' }];
  const result = searchKnowledge('¿qué requisitos tiene un clip?', { help: guideItems(), docs });
  assert.equal(result.order[0], 'ayuda');
  assert.ok(result.groups.ayuda[0].score >= 6);
});
