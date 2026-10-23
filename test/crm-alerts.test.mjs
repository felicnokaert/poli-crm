import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrmAlerts, reconcile, groupAlerts } from '../src/crm-alerts.mjs';
import { refreshAlerts } from '../lib/crm-alerts.mjs';

const now = Date.parse('2026-10-24T15:00:00Z');
const ago = (hours) => new Date(now - hours * 3600000).toISOString();
const data = {
  orders: [
    { id: 'o1', name: '#1174', created_at: ago(24 * 10), financial_status: 'PAID', fulfillment_status: 'UNFULFILLED', delivery: 'PICK_UP', total: 45000 },
    { id: 'o2', name: '#1192', created_at: ago(60), financial_status: 'PAID', fulfillment_status: 'UNFULFILLED', delivery: 'SHIPPING', total: 32000 },
    { id: 'o3', name: '#1193', created_at: ago(3), financial_status: 'PAID', fulfillment_status: 'UNFULFILLED', delivery: 'SHIPPING', total: 1 },
  ],
  checkouts: [{ id: 'c1', created_at: ago(5), completed: false, total: 250000, items: [{ title: 'Kit', quantity: 1 }] }],
  products: [{ id: 'p1', status: 'ACTIVE', description_length: 100, seo_title: 'x', media_count: 1, total_inventory: 5 }],
  variants: [{ id: 'v1', product_id: 'p1', sku: 'A', price: 0, inventory_quantity: 5, weight_grams: 100 }],
  days: [
    { day: '2026-10-23', orders: 1, amount: 100 }, { day: '2026-10-15', orders: 5, amount: 1000 },
  ],
  statusRows: [{ key: 'integration:shopify', last_run_at: ago(50), ok: true, detail: {} }],
  mlItems: [{ id: 'M1', seller_id: '1', status: 'active', available_quantity: 0, sold_quantity: 5, clips_count: 0, pictures_count: 5, description_length: 100 }],
  mlMetrics: [], mlNames: { 1: 'POLIPLAST' },
};

test('alertas: pedidos atrasados, carritos, precio en cero, caída de ventas, stock de ML e integración caída', () => {
  const list = buildCrmAlerts(data, now);
  const types = list.map((alert) => alert.type);
  assert.ok(types.includes('shopify-pedido'));
  assert.equal(list.filter((alert) => alert.type === 'shopify-pedido').length, 2); // el de 3 h todavía está a tiempo
  const high = list.filter((alert) => alert.severity === 'alta').map((alert) => alert.type);
  assert.ok(high.includes('shopify-precio_cero'));
  assert.ok(high.includes('shopify-caida'));
  assert.ok(high.includes('ml-stock'));
  assert.ok(high.includes('integracion'));
  assert.equal(list.find((alert) => alert.type === 'shopify-carritos').severity, 'media');
  assert.equal(list[0].severity, 'alta'); // ordenadas por gravedad
});

test('persistencia: las que siguen suman un día, las nuevas arrancan, las arregladas se resuelven', () => {
  const t1 = '2026-10-23T12:00:00.000Z';
  const first = reconcile([], [{ type: 'a', entity_id: '', severity: 'alta', title: 'A' }, { type: 'b', entity_id: 'x', severity: 'media', title: 'B' }], t1);
  assert.deepEqual(first.upserts.map((row) => row.runs_active), [1, 1]);
  const stored = first.upserts;
  const t2 = '2026-10-24T12:00:00.000Z';
  const second = reconcile(stored, [{ type: 'a', entity_id: '', severity: 'alta', title: 'A' }, { type: 'c', entity_id: '', severity: 'baja', title: 'C' }], t2);
  const a = second.upserts.find((row) => row.type === 'a');
  assert.equal(a.runs_active, 2);
  assert.equal(a.first_seen, t1);
  assert.equal(second.upserts.find((row) => row.type === 'c').runs_active, 1);
  assert.deepEqual(second.resolved, [{ type: 'b', entity_id: 'x' }]);
  // una resuelta que vuelve a aparecer arranca de nuevo
  const again = reconcile([{ ...stored[1], resolved_at: t2 }], [{ type: 'b', entity_id: 'x', severity: 'media', title: 'B' }], '2026-10-25T12:00:00.000Z');
  assert.equal(again.upserts[0].runs_active, 1);
  assert.equal(again.upserts[0].first_seen, '2026-10-25T12:00:00.000Z');
});

test('el panel agrupa por gravedad y cuenta los días', () => {
  const rows = [
    { type: 'a', entity_id: '', severity: 'alta', title: 'A', first_seen: '2026-10-21T15:00:00Z' },
    { type: 'b', entity_id: '', severity: 'baja', title: 'B', first_seen: '2026-10-24T14:00:00Z' },
    { type: 'c', entity_id: '', severity: 'alta', title: 'C', first_seen: '2026-10-24T14:00:00Z', resolved_at: '2026-10-24T15:00:00Z' },
  ];
  const groups = groupAlerts(rows, now);
  assert.equal(groups.total, 2);
  assert.equal(groups.alta[0].days, 3);
  assert.equal(groups.baja.length, 1);
});

test('refreshAlerts lee, compara y guarda sin tocar nada más', async () => {
  const saved = []; const patched = [];
  const tables = {
    shopify_orders: data.orders, shopify_checkouts: data.checkouts, shopify_products: data.products, shopify_variants: data.variants, shopify_daily: data.days,
    crm_system_status: data.statusRows, ml_items: data.mlItems, ml_accounts: [{ seller_id: '1', nickname: 'POLIPLAST' }], ml_account_metrics: [],
    crm_alerts: [{ type: 'viejo', entity_id: '', severity: 'media', title: 'Viejo', first_seen: ago(48), runs_active: 2, resolved_at: null }],
  };
  const store = {
    select: async (path) => tables[path.split('?')[0]] || [],
    upsert: async (table, rows) => saved.push([table, rows.length]),
    patch: async (table, filter) => patched.push([table, filter]),
  };
  const result = await refreshAlerts({}, null, store, now);
  assert.equal(result.ok, true);
  assert.ok(result.active >= 6);
  assert.equal(result.resolved, 1);
  assert.deepEqual(saved.map(([table]) => table), ['crm_alerts']);
  assert.match(patched[0][1], /type=eq.viejo/);
});
