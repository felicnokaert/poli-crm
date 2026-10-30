import test from 'node:test';
import assert from 'node:assert/strict';
import { addBlock, addManual, blockedBy, filterAllowed, identifiers, mergeBlocks, removeBlock, activeEntries } from '../src/do-not-contact.mjs';
import { buildQueue } from '../src/prospect-queue.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';

const prospect = { id: 'p1', company: 'Aislaciones Sur SRL', email: 'Ventas@AislacionesSur.com.ar', phone: '+54 9 11 5555-1234', website: 'https://www.aislacionessur.com.ar/contacto', state: 'No contactado', createdAt: '1' };

test('identifica por mail, teléfono, dominio y nombre (sin dominios genéricos)', () => {
  const ids = identifiers(prospect).map(([kind, value]) => `${kind}:${value}`);
  assert.deepEqual(ids, ['mail:ventas@aislacionessur.com.ar', 'telefono:55551234', 'dominio:aislacionessur.com.ar', 'nombre:aislaciones sur srl']);
  assert.deepEqual(identifiers({ email: 'x@gmail.com', website: 'https://instagram.com/x' }).map(([kind]) => kind), ['mail']);
});

test('agregar bloquea por cualquier dato y no duplica; quitar lo reactiva', () => {
  let { list, added } = addBlock([], prospect, { reason: 'Pidió la baja', by: 'felipe' });
  assert.equal(added, 4);
  assert.equal(addBlock(list, prospect).added, 0);
  assert.ok(blockedBy({ phone: '011 15 5555 1234' }, list));
  assert.ok(blockedBy({ website: 'aislacionessur.com.ar' }, list));
  assert.equal(blockedBy({ email: 'otro@otra.com', phone: '11 4444 9999', company: 'Otra SA' }, list), null);
  list = removeBlock(list, 'mail:ventas@aislacionessur.com.ar');
  assert.equal(activeEntries(list).length, 3);
  assert.equal(blockedBy({ email: 'ventas@aislacionessur.com.ar' }, list), null);
});

test('alta manual valida y la lista filtra registros', () => {
  assert.equal(addManual([], { kind: 'mail', value: 'sin-arroba' }).added, 0);
  const { list, added } = addManual([], { kind: 'dominio', value: 'https://www.empresa.com/algo' });
  assert.equal(added, 1);
  assert.equal(list[0].value, 'empresa.com');
  assert.equal(filterAllowed([{ website: 'empresa.com' }, { website: 'otra.com' }], list).length, 1);
});

test('un prospecto bloqueado no entra en la cola', () => {
  const other = { id: 'p2', company: 'Otra SRL', phone: '+5491144449999', state: 'No contactado', createdAt: '2' };
  const { list } = addBlock([], prospect);
  assert.deepEqual(buildQueue([prospect, other], new Map(), { blocked: list }), ['p2']);
  assert.deepEqual(buildQueue([prospect, other], new Map()).sort(), ['p1', 'p2']);
});

test('al juntar navegadores gana la marca más nueva y lo quitado no reaparece', () => {
  const entry = { id: 'mail:a@b.com', kind: 'mail', value: 'a@b.com', at: '2026-10-30T10:00:00Z' };
  const removed = { ...entry, removedAt: '2026-10-30T12:00:00Z' };
  assert.equal(activeEntries(mergeBlocks([removed], [entry])).length, 0);
  assert.equal(activeEntries(mergeBlocks([entry], [])).length, 1);
  const merged = mergeWorkspaceState({ doNotContact: [removed] }, { doNotContact: [entry] });
  assert.equal(activeEntries(merged.doNotContact).length, 0);
});
