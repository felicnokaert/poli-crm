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
