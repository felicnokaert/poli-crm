import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Reactivar también usa la última compra de la ficha y la cola se filtra por familia (22/10)', async () => {
  const { reactivationQueue, infoFromCrm, matchesFamily, queueFamilies } = await import('../src/daily-queues.mjs');
  const client = { id: 'x', company: 'Espumas Oeste', family: 'Poliuretano', lastPurchase: '10/03/2026', totalPurchases: 5 };
  const info = infoFromCrm(client, '2026-10-22');
  assert.equal(info.status, 'dormido');
  assert.equal(info.recurrent, true);
  assert.equal(reactivationQueue({ clients: [client], base: new Map(), today: '2026-10-22' }).length, 1);
  assert.equal(matchesFamily(client, 'poliuretano'), true);
  assert.equal(matchesFamily(client, 'Resinplast'), false);
  assert.deepEqual(queueFamilies([client], [{ family: 'Resinplast' }]), ['Poliuretano', 'Resinplast']);
});

test('se pasaron de su frecuencia: activos frecuentes atrasados, no los dormidos', async () => {
  const { overdueQueue, overdueMessage } = await import('../src/daily-queues.mjs');
  const clients = [{ id: 'a', company: 'ACME', contact: 'Juan Pérez', mainProduct: 'Easyspray' }, { id: 'b', company: 'Beta' }, { id: 'c', company: 'Gamma' }];
  const base = new Map([
    ['a', { frequencyDays: 30, daysSince: 60, status: 'activo', purchases24: 8, total24: 100, big: false }],
    ['b', { frequencyDays: 30, daysSince: 35, status: 'activo', purchases24: 8, total24: 100 }],
    ['c', { frequencyDays: 30, daysSince: 200, status: 'dormido', purchases24: 8, total24: 100 }],
  ]);
  const list = overdueQueue({ clients, base, today: '2026-10-22' });
  assert.deepEqual(list.map((item) => item.client.company), ['ACME']);
  assert.equal(list[0].late, 30);
  assert.match(overdueMessage(clients[0], list[0].info, 'Felipe'), /Hola Juan.*Felipe.*Easyspray/);
});
