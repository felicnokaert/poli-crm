import test from 'node:test';
import assert from 'node:assert/strict';
import { shippingChange, recentShippingChanges } from '../src/ml-shipping-change.mjs';
import { annotateShipping } from '../lib/ml-shipping.mjs';
import { buildCrmAlerts } from '../src/crm-alerts.mjs';

test('cambios de envío: Full, envío gratis y sin falsas alarmas', () => {
  assert.equal(shippingChange({ logistic_type: 'cross_docking', free_shipping: false }, { logistic_type: 'fulfillment', free_shipping: false }), 'pasó a Full');
  assert.equal(shippingChange({ logistic_type: 'fulfillment' }, { logistic_type: 'cross_docking' }), 'dejó Full');
  assert.equal(shippingChange({ logistic_type: 'cross_docking' }, { logistic_type: 'self_service' }), 'cambió el envío de Colecta a Flex');
  assert.equal(shippingChange({ logistic_type: 'cross_docking', free_shipping: false }, { logistic_type: 'cross_docking', free_shipping: true }), 'pasó a envío gratis');
  assert.equal(shippingChange({ free_shipping: true }, { free_shipping: false }), 'dejó el envío gratis');
  assert.equal(shippingChange({ logistic_type: '', free_shipping: false }, { logistic_type: 'fulfillment', free_shipping: false }), ''); // antes no se guardaba: no avisa
  assert.equal(shippingChange(undefined, { logistic_type: 'fulfillment' }), '');
});

test('al guardar, anota el cambio de hoy y conserva el anterior si hoy no cambió', async () => {
  const store = { select: async () => [{ id: 'A', free_shipping: false, logistic_type: 'cross_docking', shipping_change: '', shipping_changed_at: null }, { id: 'B', free_shipping: true, logistic_type: 'cross_docking', shipping_change: 'pasó a envío gratis', shipping_changed_at: '2026-10-20T00:00:00Z' }] };
  const rows = await annotateShipping(store, [
    { id: 'A', free_shipping: false, logistic_type: 'fulfillment' },
    { id: 'B', free_shipping: true, logistic_type: 'cross_docking' },
    { id: 'C', free_shipping: false, logistic_type: 'drop_off' },
  ], '2026-10-24T10:00:00Z');
  assert.equal(rows[0].shipping_change, 'pasó a Full');
  assert.equal(rows[0].shipping_changed_at, '2026-10-24T10:00:00Z');
  assert.equal(rows[1].shipping_change, 'pasó a envío gratis');
  assert.equal(rows[1].shipping_changed_at, '2026-10-20T00:00:00Z');
  assert.equal(rows[2].shipping_change, '');
});

test('alerta: solo los cambios de los últimos 7 días', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const competitors = [
    { id: 'A', seller_nickname: 'BAROVO', title: 'Espuma PU 750 ml', shipping_change: 'pasó a Full', shipping_changed_at: '2026-10-23T10:00:00Z' },
    { id: 'B', seller_nickname: 'VIEJO', title: 'x', shipping_change: 'pasó a Full', shipping_changed_at: '2026-10-01T10:00:00Z' },
  ];
  assert.equal(recentShippingChanges(competitors, now).length, 1);
  const alerts = buildCrmAlerts({ competitors }, now).filter((alert) => alert.type === 'ml-envio-competidor');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /^BAROVO pasó a Full/);
});
