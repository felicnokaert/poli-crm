// Devoluciones de Mercado Libre para la app de conteo (25/11, pedido de Diego): expedición escanea la etiqueta del paquete que vuelve
// y la app necesita saber de qué devolución es, de qué cuenta y qué productos tendrían que venir.
//
// No sabemos todavía qué número trae la etiqueta de vuelta (envío de la devolución, reclamo o pedido), así que se prueban los tres,
// cuenta por cuenta (el token de otra cuenta da 403/404):
//   1) como reclamo:   GET /post-purchase/v2/claims/{id}/returns
//   2) como envío:     GET /shipments/{id} (formato viejo: trae order_id) → reclamos del pedido
//   3) como pedido:    GET /post-purchase/v1/claims/search?resource=order&resource_id={id}
// Con el reclamo: GET /post-purchase/v1/claims/{id} (motivo y comprador) y /v2/claims/{id}/returns (envíos de vuelta y productos).
// SIN PROBAR contra Mercado Libre: con ?debug=1 la respuesta trae qué se probó y qué contestó ML, para ajustarlo con la primera etiqueta real.
// Nunca devuelve datos personales del comprador (solo el apodo de Mercado Libre).

const API = 'https://api.mercadolibre.com';

async function mlGet(http, path, token) {
  try {
    const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    const body = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body };
  } catch (error) {
    return { status: 0, ok: false, body: null, error: String(error?.message || error).slice(0, 80) };
  }
}

const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const digits = (value) => String(value ?? '').replace(/\D/g, '');

/** Los números que puede traer la etiqueta: se lee el número largo (también del QR {"id":"…"}). */
export function returnIdOf(text) {
  const raw = String(text ?? '').trim();
  try { const parsed = JSON.parse(raw); if (parsed?.id) return digits(parsed.id); } catch { /* no es JSON */ }
  const found = raw.match(/\d{6,20}/);
  return found ? found[0] : '';
}

/** Transporte del envío de vuelta, legible. */
export function carrierOf(shipment = {}, ret = {}) {
  const text = [shipment?.logistic?.type, shipment?.logistic_type, shipment?.tracking_method, shipment?.service_id, ret?.shipping?.carrier, ret?.carrier]
    .filter(Boolean).join(' ').toLowerCase();
  if (/correo|ca_|argentino/.test(text)) return 'Correo Argentino';
  if (/oca/.test(text)) return 'OCA';
  if (/andreani/.test(text)) return 'Andreani';
  if (/drop_off|cross_docking|xd_drop/.test(text)) return 'Mercado Envíos';
  if (/self_service|flex/.test(text)) return 'Flex';
  return shipment?.tracking_method || null;
}

// Arma la devolución con lo que haya: reclamo, devolución (returns) y, si hace falta, el pedido.
async function buildReturn({ http, token, claimId, account, store, debug }) {
  const [claim, returns] = await Promise.all([
    mlGet(http, `/post-purchase/v1/claims/${claimId}`, token),
    mlGet(http, `/post-purchase/v2/claims/${claimId}/returns`, token),
  ]);
  debug?.push({ paso: `reclamo ${claimId}`, reclamo: claim.status, devolucion: returns.status });
  if (!claim.ok && !returns.ok) return null;
  const c = claim.body || {};
  const r = returns.body || {};
  const orderId = digits(r.resource_id || c.resource_id || list(r.orders)[0]?.order_id || '');
  // Productos: los de la devolución; si no vienen, los del pedido.
  let rows = list(r.orders).map((o) => ({ item_id: o.item_id, variation_id: o.variation_id, qty: Number(o.return_quantity ?? o.quantity) || 1 }));
  if (!rows.length && orderId) {
    const order = await mlGet(http, `/orders/${orderId}`, token);
    debug?.push({ paso: `pedido ${orderId}`, estado: order.status });
    rows = list(order.body?.order_items).map((line) => ({ item_id: line.item?.id, variation_id: line.item?.variation_id, qty: Number(line.quantity) || 1, title: line.item?.title, seller_sku: line.item?.seller_sku }));
  }
  const ids = [...new Set(rows.map((row) => row.item_id).filter(Boolean))];
  const items = new Map();
  if (ids.length && store) {
    const found = await store.select(`ml_items?select=id,sku,title,variation_skus&id=in.(${ids.join(',')})`).catch(() => []);
    for (const row of found) items.set(row.id, row);
  }
  const lines = rows.map((row) => {
    const item = items.get(row.item_id) || {};
    const variation = list(item.variation_skus).find((entry) => String(entry.id) === String(row.variation_id || ''));
    const sku = String(row.seller_sku || item.sku || variation?.sku || '').trim().toUpperCase() || null;
    return { sku, description: String(item.title || row.title || '').slice(0, 120), qty: row.qty, item_id: row.item_id || null };
  });
  const shipments = list(r.shipments);
  const back = shipments.find((s) => /return|devol/i.test(String(s.type || s.destination?.name || ''))) || shipments[0] || {};
  let carrier = null;
  if (back.shipment_id) {
    const ship = await mlGet(http, `/shipments/${back.shipment_id}`, token);
    carrier = carrierOf(ship.body || {}, r);
  }
  // Apodo del comprador (nunca nombre, mail ni teléfono).
  const buyerId = list(c.players).find((p) => /complainant|buyer/i.test(String(p.role || p.type || '')))?.user_id;
  let buyer = null;
  if (buyerId) {
    const user = await mlGet(http, `/users/${buyerId}`, token);
    buyer = user.body?.nickname || null;
  }
  return {
    id: String(r.id || claimId),
    claim_id: String(claimId),
    order_id: orderId || null,
    shipment_id_devolucion: back.shipment_id ? String(back.shipment_id) : null,
    account: account.nickname || String(account.seller_id),
    carrier,
    buyer,
    reason: c.reason_id || c.reason?.name || null,
    estado_ml: r.status || c.status || null,
    fecha: r.date_created || c.date_created || null,
    lines,
  };
}

/** Busca una devolución por el número escaneado, en todas las cuentas. */
export async function returnLookup(rawId, { http, store, tokenFor, accounts, withDebug = false, deadline = Date.now() + 45000 }) {
  const id = returnIdOf(rawId);
  const debug = withDebug ? [] : null;
  if (!id) return { found: false, error: 'No se leyó ningún número de la etiqueta.', ...(debug ? { debug } : {}) };
  for (const account of accounts) {
    if (Date.now() > deadline) break;
    const label = account.nickname || String(account.seller_id);
    let token;
    try { token = await tokenFor(account); } catch { debug?.push({ cuenta: label, paso: 'sin acceso a la cuenta' }); continue; }
    // 1) como reclamo
    const asClaim = await mlGet(http, `/post-purchase/v2/claims/${id}/returns`, token);
    debug?.push({ cuenta: label, paso: 'como reclamo', estado: asClaim.status });
    if (asClaim.ok) {
      const built = await buildReturn({ http, token, claimId: id, account, store, debug });
      if (built) return { found: true, matched_as: 'reclamo', return: built, ...(debug ? { debug } : {}) };
    }
    // 2) como envío (de vuelta o el original): el formato viejo trae order_id
    const asShipment = await mlGet(http, `/shipments/${id}`, token);
    debug?.push({ cuenta: label, paso: 'como envío', estado: asShipment.status, claves: asShipment.body ? Object.keys(asShipment.body).slice(0, 25) : [] });
    let orderId = '';
    if (asShipment.ok) orderId = digits(asShipment.body?.order_id || list(asShipment.body?.order_ids)[0] || '');
    // 3) como pedido
    if (!orderId) orderId = id;
    const claims = await mlGet(http, `/post-purchase/v1/claims/search?resource=order&resource_id=${orderId}`, token);
    debug?.push({ cuenta: label, paso: `reclamos del pedido ${orderId}`, estado: claims.status, cantidad: list(claims.body?.data || claims.body?.results).length });
    const found = list(claims.body?.data || claims.body?.results);
    // Preferir el reclamo con devolución.
    const pick = found.find((c) => /return/i.test(String(c.type || c.stage || ''))) || found[0];
    if (pick?.id) {
      const built = await buildReturn({ http, token, claimId: pick.id, account, store, debug });
      if (built) return { found: true, matched_as: asShipment.ok ? 'envío' : 'pedido', return: built, ...(debug ? { debug } : {}) };
    }
    if (asShipment.ok) {
      // Es un envío de esta cuenta pero sin reclamo: se avisa (puede ser una devolución sin reclamo, o la etiqueta original).
      return { found: false, reason: 'envio_sin_reclamo', account: label, ...(debug ? { debug } : {}) };
    }
  }
  return { found: false, ...(debug ? { debug } : {}) };
}
