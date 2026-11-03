import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingByPerson } from '../src/team-coaching.mjs';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const row = (author, outcome, note = 'Prospecto (Penosil, zona A, versión A)', at = '2026-11-02T10:00:00Z') => ({ kind: 'contacto', author_email: author, author_name: author.split('@')[0], note, outcome, noted_at: at });

test('cuenta contactos, interés y motivos por persona', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => row('a@x.com', 'Sin interés · Precio')),
    row('a@x.com', 'Con interés'), row('a@x.com', 'Contactado · No respondió'),
    row('b@x.com', 'Con interés'),
  ];
  const [a, b] = coachingByPerson(rows, { now: NOW });
  assert.equal(a.email, 'a@x.com');
  assert.equal(a.contacts, 8);
  assert.equal(a.interested, 1);
  assert.equal(a.reasons[0].reason, 'Precio');
  assert.equal(b.contacts, 1);
});

test('sugiere práctica solo con datos suficientes y un motivo dominante', () => {
  const many = Array.from({ length: 8 }, () => row('a@x.com', 'Sin interés · Ya tiene proveedor'));
  const [a] = coachingByPerson(many, { now: NOW });
  assert.equal(a.advice[0].objection, 'proveedor');
  const [few] = coachingByPerson(many.slice(0, 3), { now: NOW });
  assert.equal(few.advice.length, 0);
  assert.equal(few.enoughData, false);
});

test('más de la mitad sin respuesta sugiere cambiar el mensaje; lo viejo no cuenta', () => {
  const rows = [...Array.from({ length: 8 }, () => row('a@x.com', 'Contactado · No respondió')), row('a@x.com', 'Con interés', undefined, '2025-01-01T00:00:00Z')];
  const [a] = coachingByPerson(rows, { now: NOW });
  assert.equal(a.contacts, 8);
  assert.ok(a.advice.some((item) => /no responde/i.test(item.text)));
});
