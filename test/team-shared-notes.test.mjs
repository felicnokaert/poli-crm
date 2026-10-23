import { test } from 'node:test';
import assert from 'node:assert/strict';
import { othersContacts, othersNotes, rowsSignature, sharedNoteRows } from '../src/team-shared-notes.mjs';
import { teamNotes } from '../src/assistant-team.mjs';
import { weekActivity, weeklySummaryText } from '../src/weekly-summary.mjs';
import { productMlSheet, sheetText } from '../src/product-ml-sheet.mjs';

test('notas compartidas: arma las filas de la persona, sin lo borrado ni lo muy viejo', () => {
  const data = {
    interactions: [
      { id: 'i1', company: 'Acme', summary: 'Pidió precio del easyspray', createdAt: '2026-10-20T10:00:00Z' },
      { id: 'i2', company: 'Vieja', summary: 'Algo de hace mucho', createdAt: '2024-01-01T10:00:00Z' },
      { id: 'i3', company: 'Borrada', summary: 'x', createdAt: '2026-10-20T10:00:00Z', deleted: true },
    ],
    clients: [{ id: 'c1', company: 'Beta', notes: 'Compra cada mes', updatedAt: '2026-10-21T10:00:00Z', contactLog: [{ at: '2026-10-22T12:00:00Z', queue: 'reactivar', outcome: 'Precio' }] }],
    prospects: [{ id: 'p1', company: 'Gamma', family: 'Poliuretano', notes: 'Le interesa', updatedAt: '2026-10-22T10:00:00Z', history: [{ at: '2026-10-22T11:00:00Z', state: 'contactado', outcome: 'No respondió', variant: 'A', family: 'Poliuretano', zone: 'A' }] }],
  };
  const rows = sharedNoteRows(data, { email: 'Brenda@grupopoliplast.com.ar', name: 'Brenda', today: '2026-10-23' });
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.author_email === 'brenda@grupopoliplast.com.ar' && row.id.startsWith('brenda@grupopoliplast.com.ar|')));
  assert.ok(!rows.some((row) => /Vieja|Borrada/.test(row.company)));
  assert.equal(rows.find((row) => row.kind === 'contacto' && row.company === 'Gamma').outcome, 'contactado · No respondió');
  assert.notEqual(rowsSignature(rows), rowsSignature(rows.slice(1)));
  assert.equal(othersNotes(rows, 'brenda@grupopoliplast.com.ar').length, 0);
  assert.equal(othersContacts(rows, 'felipe@grupopoliplast.com.ar').length, 2);
});

test('el asistente usa lo que anotaron los demás y el resumen cuenta al equipo', () => {
  const shared = [{ author_email: 'brenda@grupopoliplast.com.ar', author_name: 'Brenda Pérez', kind: 'historial', company: 'Acme', note: 'Pidió precio del easyspray por mayor', noted_at: '2026-10-20T10:00:00Z' }];
  const lines = teamNotes('easyspray por mayor', { shared });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /anotó Brenda/);
  const contacts = [
    { author_email: 'brenda@grupopoliplast.com.ar', author_name: 'Brenda', kind: 'contacto', outcome: 'Precio', noted_at: '2026-10-21T10:00:00Z' },
    { author_email: 'yuliani@grupopoliplast.com.ar', author_name: 'Yuliani', kind: 'contacto', outcome: 'Con interés', noted_at: '2026-10-22T10:00:00Z' },
  ];
  const activity = weekActivity({ shared: contacts, today: '2026-10-23' });
  assert.equal(activity.contacted, 2);
  assert.equal(activity.interested, 1);
  assert.equal(activity.others, 2);
  assert.match(weeklySummaryText({ activity, today: '2026-10-23' }), /vos y 2 más del equipo/);
});

test('ficha desde Mercado Libre: descripción de la más vendida y preguntas frecuentes', () => {
  const items = [{ id: 'MLA1', title: 'Easyspray 700 g', sold_quantity: 50 }, { id: 'MLA2', title: 'Easyspray 450 g', sold_quantity: 10 }];
  const descriptions = { MLA1: 'Espuma de poliuretano lista para usar. Aislante térmico. https://link.com', MLA2: 'otra' };
  const questions = [
    { item_id: 'MLA1', question: 'Cuanto rinde por m2?', answer: 'Rinde 2 m2 en 2 cm de espesor. Saludos.' },
    { item_id: 'MLA2', question: 'Cuanto rinde?', answer: 'Rinde 2 m2 en 2 cm de espesor. Gracias.' },
    { item_id: 'MLA1', question: 'Hacen envios a Cordoba?', answer: 'Sí, por Mercado Envíos.' },
    { item_id: 'MLA1', question: 'Envian a Salta?', answer: 'Sí, por Mercado Envíos.' },
  ];
  const sheet = productMlSheet({ items, questions, descriptions });
  assert.equal(sheet.sourceItem.id, 'MLA1');
  assert.ok(!sheet.description.includes('http'));
  assert.equal(sheet.faq.length, 1);
  assert.equal(sheet.faq[0].key, 'rendimiento');
  assert.match(sheet.faq[0].answer, /2 m2 en 2 cm/);
  const text = sheetText('Easyspray', sheet);
  assert.match(text, /Preguntas frecuentes/);
  assert.ok(!/envio/i.test(text));
});
