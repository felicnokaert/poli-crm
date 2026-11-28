import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotifications, unreadCount } from '../src/notifications.mjs';
import { mergeWorkspaceState } from '../src/workspace.mjs';

test('Campanita: vencidas y de hoy son «para hacer», alertas bajas son novedades', () => {
  const items = buildNotifications({
    today: '2026-11-26',
    tasks: [{ id: 't1', title: 'Llamar', dueDate: '2026-11-24' }, { id: 't2', title: 'Hoy', dueDate: '2026-11-26' }, { id: 't3', title: 'Mañana', dueDate: '2026-11-27' }, { id: 't4', title: 'Hecha', dueDate: '2026-11-20', done: true }],
    alerts: [{ type: 'shopify-pedido', entity_id: 'x', severity: 'baja', title: 'Pedido', first_seen: '2026-11-25' }, { type: 'ml-token', entity_id: 'y', severity: 'alta', title: 'Token', first_seen: '2026-11-25' }],
  });
  assert.deepEqual(items.map((item) => item.title), ['Token', 'Llamar', 'Hoy', 'Pedido']);
  assert.equal(items.find((item) => item.title === 'Pedido').kind, 'info');
  assert.equal(unreadCount(items, [items[0].id]), 3);
});

test('Campanita: sin el módulo de tareas no aparecen tareas; lo leído se junta entre equipos', () => {
  const items = buildNotifications({ today: '2026-11-26', tasks: [{ id: 't1', title: 'Llamar', dueDate: '2026-11-24' }], allows: (module) => module !== 'tasks' });
  assert.equal(items.length, 0);
  assert.deepEqual(mergeWorkspaceState({ notificationsRead: ['a'] }, { notificationsRead: ['b'] }).notificationsRead.sort(), ['a', 'b']);
});
