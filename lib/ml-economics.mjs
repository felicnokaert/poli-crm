// Ganancia y reposición por publicación (23/10, Felipe: "me encanta, dale"). De las ventas de los últimos 30
// días (las mismas órdenes que ya lee el Resumen) sale, por publicación: unidades, facturado y la comisión que
// cobró Mercado Libre (order_items[].sale_fee, por unidad). El envío que paga el vendedor se toma de UNA venta
// reciente de cada publicación (GET /shipments/{id}/costs) y se reparte por unidad. Se guarda en
// ml_item_economics (migración 20261023_ml_economics.sql); el costo del producto lo carga Felipe (unit_cost).
const DAY = 86400000;
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function itemEconomics(orders = [], { now = Date.now() } = {}) {
  const since = now - 30 * DAY;
  const byItem = {};
  for (const order of orders) {
    if (order?.status !== 'paid' || Date.parse(order.date_created) < since) continue;
    const lines = order.order_items || [];
    for (const line of lines) {
      const id = String(line.item?.id || '');
      if (!id) continue;
      const quantity = num(line.quantity);
      byItem[id] ||= { units: 0, revenue: 0, fees: 0, lastShipment: null };
      byItem[id].units += quantity;
      byItem[id].revenue += quantity * num(line.unit_price);
      byItem[id].fees += quantity * num(line.sale_fee);
      // Para el envío sirve una orden de un solo producto (si no, no se sabe cuánto le toca a cada uno).
      if (!byItem[id].lastShipment && lines.length === 1 && order.shipping?.id) byItem[id].lastShipment = { id: String(order.shipping.id), units: quantity || 1 };
    }
  }
  return byItem;
}

export function economicsRows(byItem, sellerId) {
  return Object.entries(byItem).map(([id, entry]) => ({
    id,
    seller_id: String(sellerId),
    units_30d: entry.units,
    revenue_30d: Math.round(entry.revenue * 100) / 100,
    fees_30d: Math.round(entry.fees * 100) / 100,
    last_shipment_id: entry.lastShipment?.id || '',
    last_shipment_units: entry.lastShipment?.units || null,
    updated_at: new Date().toISOString(),
  }));
}

// Lo que pagó el vendedor por ese envío (senders[].cost; si no viene separado, nada).
export function senderCost(body, sellerId) {
  const senders = Array.isArray(body?.senders) ? body.senders : [];
  const mine = senders.filter((sender) => !sellerId || String(sender.user_id || '') === String(sellerId));
  const list = mine.length ? mine : senders;
  if (!list.length) return null;
  return list.reduce((sum, sender) => sum + num(sender.cost), 0);
}

// Envío de muestra para las que más venden y no se revisaron en 14 días.
export async function sampleShipping(account, rows, { get, token, store, existing = new Map(), deadline = Date.now() + 15000, max = 25, pause = 250, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const fresh = (id) => { const at = Date.parse(existing.get(id) || ''); return Number.isFinite(at) && Date.now() - at < 14 * DAY; };
  const todo = rows.filter((row) => row.last_shipment_id && !fresh(row.id)).sort((a, b) => b.units_30d - a.units_30d).slice(0, max);
  const updates = [];
  const errors = new Set();
  for (const row of todo) {
    if (Date.now() > deadline) break;
    try {
      const cost = senderCost(await get(`/shipments/${row.last_shipment_id}/costs`, token), account.seller_id);
      updates.push({ id: row.id, seller_id: row.seller_id, shipping_per_unit: cost == null ? null : Math.round((cost / (row.last_shipment_units || 1)) * 100) / 100, shipping_checked_at: new Date().toISOString() });
    } catch (error) {
      errors.add(`envíos: ${String(error?.message || error).slice(0, 80)}`);
      if (/unauthori[sz]ed|forbidden|403/i.test(String(error?.message || error))) break;
    }
    if (pause) await wait(pause);
  }
  if (updates.length) await store.upsert('ml_item_economics', updates);
  return { sampled: updates.length, errors: [...errors] };
}
