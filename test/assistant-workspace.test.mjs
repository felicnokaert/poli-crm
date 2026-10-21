import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAnswer, workspaceContext } from '../src/assistant-workspace.mjs';

const workspace = {
  today: '2026-10-21',
  tasks: [
    { id: 't1', title: 'Llamar por cotización', company: 'Lavopa', dueDate: '2026-10-20', done: false },
    { id: 't2', title: 'Mandar ficha', company: 'Acme', dueDate: '2026-10-21', done: false },
    { id: 't3', title: 'Hecha', dueDate: '2026-10-21', done: true },
  ],
  sales: [
    { id: 's1', customer: 'Lavopa Rolando', date: '2026-09-01', currency: 'ARS', items: [{ description: 'Penosil Easyspray 850 ml', unitPrice: 15000, quantity: 10 }] },
    { id: 's2', customer: 'Acme', date: '2026-10-05', currency: 'ARS', items: [{ description: 'Penosil Easyspray 850 ml', unitPrice: 16000, quantity: 2 }] },
  ],
  interactions: [{ id: 'i1', company: 'Lavopa Rolando', contact: 'Rolando', createdAt: '2026-10-10T12:00:00Z', summary: 'Pidió precio de 20 envases', nextAction: 'Mandar cotización' }],
  prospects: [{ id: 'p1', company: 'Aislaciones Sur', state: 'nuevo', family: 'Poliuretano', city: 'Bahía Blanca', phone: '291 000' }],
};

test('qué tengo pendiente hoy: vencidas y de hoy, sin las hechas', () => {
  const [block] = workspaceAnswer('¿Qué tengo pendiente hoy?', workspace);
  assert.equal(block.key, 'tareas');
  assert.match(block.label, /1 vencidas, 1 para hoy/);
  assert.match(block.lines[0], /^Vencida \(20\/10\/2026\): Llamar por cotización · Lavopa/);
  assert.equal(block.lines.some((line) => /Hecha/.test(line)), false);
});

test('a cuánto vendimos un producto y qué le vendimos a un cliente', () => {
  const price = workspaceAnswer('¿a cuánto vendimos easyspray?', workspace).find((block) => block.key === 'ventas');
  assert.match(price.lines[0], /\$ 16\.000 \+ IVA el 05\/10\/2026 a Acme \(antes: \$ 15\.000 el 01\/09\/2026\)/);
  const blocks = workspaceAnswer('Lavopa', workspace);
  assert.deepEqual(blocks.map((block) => block.key), ['tareas', 'ventas', 'historial']);
  assert.match(blocks[1].lines[0], /1 venta cargada; la última el 01\/09\/2026 por \$ 150\.000 \+ IVA/);
  assert.match(blocks[2].lines[0], /Pidió precio de 20 envases → próximo paso: Mandar cotización/);
  assert.match(workspaceContext(blocks), /Historial de conversaciones:/);
});

test('prospectos y preguntas que no son del espacio de trabajo', () => {
  assert.match(workspaceAnswer('mis prospectos', workspace)[0].lines[0], /Aislaciones Sur · estado: nuevo/);
  assert.deepEqual(workspaceAnswer('cuanto rinde la epoxi', workspace), []);
});
