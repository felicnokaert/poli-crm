import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMailSequence, queueSequence, guardOutbox, updateMail, mergeOutbox, mailtoLink, signalLine } from '../src/mail-sequence.mjs';
import { addBlock } from '../src/do-not-contact.mjs';

const prospect = { id: 'p1', company: 'Aislaciones Sur', email: 'ventas@sur.com.ar', rubro: 'Aislaciones', city: 'Rosario', state: 'No contactado', research: { signals: [{ key: 'aplicador', found: ['aplicamos'] }] } };

test('arma 3 mails con baja en cada uno y una frase de lo que se encontró', () => {
  const mails = buildMailSequence(prospect, { sender: 'Felipe' });
  assert.equal(mails.length, 3);
  assert.deepEqual(mails.map((item) => item.day), [0, 3, 7]);
  for (const mail of mails) assert.match(mail.body, /BAJA/);
  assert.match(mails[0].body, /aplicación e instalación/);
  assert.match(mails[1].subject, /^Re: /);
  assert.equal(signalLine({}), '');
});

test('queueSequence arma borradores, no duplica y respeta No contactar y sin mail', () => {
  const now = '2026-10-30T15:00:00.000Z';
  const first = queueSequence([], prospect, { sender: 'Felipe', now });
  assert.equal(first.added, 3);
  assert.deepEqual(first.outbox.map((item) => item.dueOn), ['2026-10-30', '2026-11-02', '2026-11-06']);
  assert.ok(first.outbox.every((item) => item.state === 'borrador'));
  assert.equal(queueSequence(first.outbox, prospect, { now }).reason, 'ya tiene mails armados');
  assert.equal(queueSequence([], { ...prospect, email: '' }).reason, 'sin mail');
  const { list } = addBlock([], prospect);
  assert.equal(queueSequence([], prospect, { blocked: list }).reason, 'en la lista de No contactar');
});

test('si el destinatario entra en No contactar, los borradores se descartan', () => {
  const { outbox } = queueSequence([], prospect, { sender: 'Felipe' });
  const approved = updateMail(outbox, 'p1:1', { state: 'aprobado' });
  const { list } = addBlock([], { email: 'ventas@sur.com.ar' });
  const guarded = guardOutbox(approved, list);
  assert.ok(guarded.every((item) => item.state === 'descartado'));
});

test('se junta entre navegadores por la marca más nueva y el mailto codifica el texto', () => {
  const a = { id: 'x', state: 'borrador', updatedAt: '1' }; const b = { id: 'x', state: 'aprobado', updatedAt: '2' };
  assert.equal(mergeOutbox([a], [b])[0].state, 'aprobado');
  assert.equal(mergeOutbox([b], [a])[0].state, 'aprobado');
  assert.match(mailtoLink({ to: 'a@b.com', subject: 'Hola ñ', body: 'x y' }), /^mailto:a%40b\.com\?subject=Hola%20%C3%B1&body=x%20y$/);
});
