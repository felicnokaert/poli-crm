// Operación de Shopify (24/10): lo que hay que atender ya (pedidos sin entregar), el embudo semanal y los carritos para recuperar.
// Todo sale de los pedidos y carritos copiados (sin datos de compradores). No actúa: avisa.
const HOUR = 3600 * 1000;
const OPEN = new Set(['UNFULFILLED', 'PARTIALLY_FULFILLED', 'IN_PROGRESS', 'ON_HOLD', 'SCHEDULED']);
const PAID = new Set(['PAID', 'PARTIALLY_PAID']);

export const SHIP_LIMIT_HOURS = 24; // envío pago sin despachar
export const PICKUP_LIMIT_DAYS = 7; // retiro pago sin retirar

export const ageDays = (iso, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(iso)) / (24 * HOUR)));

// Pedidos pagos sin entregar que ya pasaron el plazo. Los retiros tienen otro plazo y otro mensaje.
export function pendingOrders(orders = [], now = Date.now()) {
  const list = [];
  for (const order of orders) {
    if (order.cancelled || order.test || !PAID.has(order.financial_status) || !OPEN.has(order.fulfillment_status)) continue;
    const hours = (now - Date.parse(order.created_at)) / HOUR;
    const pickup = order.delivery === 'PICK_UP';
    const overdue = pickup ? hours > PICKUP_LIMIT_DAYS * 24 : hours > SHIP_LIMIT_HOURS;
    if (!overdue) continue;
    list.push({ ...order, kind: pickup ? 'retiro' : 'envio', days: Math.floor(hours / 24), hours: Math.floor(hours) });
  }
  return list.sort((a, b) => b.hours - a.hours);
}

// Carritos para recuperar: sin completar, con monto, sin repetidos (mismo contenido y monto) y los más recientes primero.
export function recoverList(checkouts = [], limit = 15) {
  const seen = new Set();
  const out = [];
  for (const checkout of [...checkouts].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (checkout.completed || !(checkout.total > 0)) continue;
    const key = `${(checkout.items || []).map((item) => `${item.title}x${item.quantity}`).join('|')}#${checkout.total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(checkout);
    if (out.length >= limit) break;
  }
  return out;
}

// Monday de la semana argentina (UTC-3) de una fecha.
export function weekStart(iso) {
  const local = new Date(Date.parse(iso) - 3 * HOUR);
  const day = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - day);
  return local.toISOString().slice(0, 10);
}

// Embudo semanal posible con lo que Shopify entrega por API: carritos abandonados contra pedidos pagos.
// "Iniciaron el pago" = abandonados + pedidos; la tasa es pedidos sobre eso. Sesiones y "agregó al carrito" no están disponibles.
export function weeklyFunnel(orders = [], checkouts = [], weeks = 5, now = Date.now()) {
  const rows = new Map();
  const touch = (week) => { if (!rows.has(week)) rows.set(week, { week, abandoned: 0, orders: 0, amount: 0 }); return rows.get(week); };
  for (const order of orders) {
    if (order.cancelled || order.test || !PAID.has(order.financial_status)) continue;
    const row = touch(weekStart(order.created_at)); row.orders += 1; row.amount += Number(order.total) || 0;
  }
  const unique = new Set();
  for (const checkout of checkouts) {
    if (checkout.completed) continue;
    const key = `${checkout.created_at.slice(0, 13)}|${(checkout.items || []).map((item) => item.title).join('|')}|${checkout.total}`;
    if (unique.has(key)) continue; // el mismo carrito repetido por la tienda (robots, recargas)
    unique.add(key);
    touch(weekStart(checkout.created_at)).abandoned += 1;
  }
  const current = weekStart(new Date(now).toISOString());
  return [...rows.values()]
    .sort((a, b) => b.week.localeCompare(a.week)).slice(0, weeks)
    .map((row) => ({ ...row, started: row.abandoned + row.orders, rate: row.abandoned + row.orders > 0 ? row.orders / (row.abandoned + row.orders) : null, partial: row.week === current }));
}

// Contadores para el encabezado de la pestaña.
export function operationSummary(orders = [], checkouts = [], now = Date.now()) {
  const pending = pendingOrders(orders, now);
  return { shipping: pending.filter((item) => item.kind === 'envio').length, pickups: pending.filter((item) => item.kind === 'retiro').length, abandoned: recoverList(checkouts, 999).length };
}
