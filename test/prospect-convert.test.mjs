import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markProspect } from '../src/prospect-convert.mjs';
import { blankProspect } from '../src/prospect-model.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';

const base = (prospects, clients = []) => ({ clients, prospects, interactions: [], tasks: [] });
const prospect = (fields) => blankProspect({ id: 'p1', company: 'Ferretería Sur', family: 'Penosil', rubro: 'ferretería', city: 'Paraná', province: 'Entre Ríos', phone: '+54 9 343 4000000', ...fields }, { now: '2026-10-14T10:00:00.000Z' });

test('marcar "No contactado" o "Sin interés" no crea empresa pero guarda el prospecto', () => {
  const state = base([prospect({})]);
  const noInterest = markProspect(state, 'p1', 'Sin interés', { outcome: 'Ya tiene proveedor', user: 'felipe' });
  assert.equal(noInterest.result, 'marcado');
  assert.equal(noInterest.state.clients.length, 0);
  assert.equal(noInterest.state.prospects[0].state, 'Sin interés');
  assert.equal(noInterest.state.prospects[0].outcome, 'Ya tiene proveedor');
});

test('marcar "Contactado" crea la Empresa y la vincula en los dos sentidos', () => {
  const state = base([prospect({})]);
  const { state: next, result, linkedClientId } = markProspect(state, 'p1', 'Contactado', { newClientId: 'c-nuevo', user: 'felipe', now: '2026-10-14T11:00:00.000Z' });
  assert.equal(result, 'convertido');
  assert.equal(next.clients.length, 1);
  const client = next.clients[0];
  assert.equal(client.id, 'c-nuevo');
  assert.equal(client.company, 'Ferretería Sur');
  assert.equal(client.family, 'Penosil');
  assert.equal(client.stage, 'Apertura');
  assert.equal(client.prospectId, 'p1');
  assert.equal(next.prospects[0].linkedClientId, linkedClientId);
});

test('si la empresa ya existe se vincula, no se duplica, y solo se completan campos vacíos', () => {
  const existing = { id: 'c1', company: 'FERRETERIA SUR S.R.L.', city: 'Paraná', phone: '', website: '', email: 'ventas@sur.com' };
  const state = base([prospect({ website: 'https://sur.com', email: 'otro@sur.com' })], [existing]);
  const { state: next, result } = markProspect(state, 'p1', 'Con interés', { newClientId: 'no-se-usa' });
  assert.equal(result, 'vinculado');
  assert.equal(next.clients.length, 1);
  assert.equal(next.clients[0].website, 'https://sur.com');
  assert.equal(next.clients[0].email, 'ventas@sur.com', 'no pisa un dato ya cargado');
  assert.equal(next.prospects[0].linkedClientId, 'c1');
});

test('marcar dos veces no vuelve a crear la empresa', () => {
  const first = markProspect(base([prospect({})]), 'p1', 'Contactado', { newClientId: 'c-1' });
  const second = markProspect(first.state, 'p1', 'Con interés', { newClientId: 'c-2' });
  assert.equal(second.state.clients.length, 1);
  assert.equal(second.state.prospects[0].state, 'Con interés');
});

test('los prospectos se sincronizan entre dispositivos como el resto de los registros', () => {
  const local = { ...base([prospect({ id: 'a', company: 'A', updatedAt: '2026-10-14T12:00:00Z' })]) };
  const remote = { ...base([prospect({ id: 'b', company: 'B' })]) };
  const merged = mergeWorkspaceState(local, remote);
  assert.deepEqual(merged.prospects.map((item) => item.id), ['a', 'b']);
});
