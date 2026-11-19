import test from 'node:test';
import assert from 'node:assert/strict';
import { probeLabels, shipmentSummary, itemsSummary } from '../lib/ml-labels-probe.mjs';

const reply = (status, json) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(json) });

test('shipmentSummary y itemsSummary no devuelven datos del comprador', () => {
  const summary = shipmentSummary({ id: 1, status: 'ready_to_ship', substatus: 'printed', logistic_type: 'cross_docking', receiver_address: { address_line: 'Calle 1' }, receiver_id: 9 });
  assert.equal(summary.status, 'ready_to_ship');
  assert.ok(!('receiver_address' in summary) && !('receiver_id' in summary));
  assert.deepEqual(itemsSummary([{ item_id: 'MLA1', description: 'Resina', quantity: 2, receiver: 'x' }]), [{ item_id: 'MLA1', description: 'Resina', quantity: 2, sku: null }]);
});

test('probeLabels prueba cada cuenta y sigue si una falla', async () => {
  const http = async (url) => {
    if (url.includes('/shipments/48485907441/items')) return reply(200, [{ item_id: 'MLA9', description: 'Resina', quantity: 1 }]);
    if (url.includes('/shipments/48485907441/history')) return reply(200, [{ status: 'ready_to_ship', substatus: 'printed', date_created: '2026-11-11T11:00:00Z' }]);
    if (url.includes('/shipments/48485907441')) return reply(200, { id: 48485907441, status: 'ready_to_ship', substatus: 'printed', receiver_address: { x: 1 } });
    if (url.includes('/orders/search')) return reply(200, { results: [], paging: { total: 0 } });
    return reply(404, { message: 'not found' });
  };
  const accounts = [{ seller_id: 1, nickname: 'A' }, { seller_id: 2, nickname: 'B' }];
  const out = await probeLabels(accounts, { http, shipmentId: '48485907441', tokenFor: async (account) => { if (account.seller_id === 2) throw new Error('sin token'); return 't'; } });
  assert.ok(out.some((row) => row.name.includes('A: envío') && row.ok));
  assert.ok(out.some((row) => row.name.includes('B: acceso') && !row.ok));
  assert.ok(!JSON.stringify(out).includes('receiver_address'));
});
