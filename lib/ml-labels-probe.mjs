// Prueba temporal del control de etiquetas (19/11, pedido de Felipe). SOLO LEE y no guarda nada: busca un envío (el número que trae la
// etiqueta, ej. 48485907441) en cada cuenta de ML y muestra qué devuelve Mercado Libre para armar la app de preparación. Los caminos salen
// de lo que conocemos de la API (no se pudo leer la documentación desde acá): si alguno cambió, el resultado lo dice.
// Nunca devuelve datos del comprador (nombre, domicilio, teléfono): solo estado, tipo de envío, productos y cantidades.
const API = 'https://api.mercadolibre.com';

async function call(http, path, token, headers = {}) {
  try {
    const response = await http(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12000) });
    const text = await response.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(text); } catch { /* texto plano */ }
    return { status: response.status, ok: response.ok, json, text: text.slice(0, 140) };
  } catch (error) {
    return { status: 0, ok: false, json: null, text: String(error?.message || error).slice(0, 140) };
  }
}

const step = (name, result, detail) => ({ name, status: result.status, ok: result.ok, detail: detail || (result.ok ? 'ok' : result.text) });

// Campos del envío que sirven para el control (sin datos del comprador).
export function shipmentSummary(body = {}) {
  return {
    id: body.id ?? null, status: body.status ?? null, substatus: body.substatus ?? null,
    logistic_type: body.logistic_type ?? body.logistic?.type ?? null, mode: body.logistic?.mode ?? body.mode ?? null,
    order_id: body.order_id ?? null, date_created: body.date_created ?? null, last_updated: body.last_updated ?? null,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 8) : null,
    has_tracking: Boolean(body.tracking_number),
  };
}
export function itemsSummary(body) {
  const list = Array.isArray(body) ? body : body?.items || body?.results || [];
  return list.slice(0, 10).map((row) => ({ item_id: row.item_id ?? row.id ?? null, description: String(row.description || row.title || '').slice(0, 90), quantity: row.quantity ?? null, sku: row.sku ?? row.seller_sku ?? null }));
}

// accounts: filas de ml_accounts. tokenFor(account) devuelve un token vigente. shipmentId: número de envío (solo dígitos).
export async function probeLabels(accounts = [], { http = fetch, tokenFor, shipmentId = '' } = {}) {
  const out = [];
  const id = String(shipmentId || '').replace(/\D/g, '');
  for (const account of accounts) {
    const label = account.nickname || String(account.seller_id);
    let token;
    try { token = await tokenFor(account); } catch (error) { out.push({ name: `${label}: acceso`, status: 0, ok: false, detail: String(error?.message || error).slice(0, 120) }); continue; }
    if (id) {
      const shipment = await call(http, `/shipments/${id}`, token, { 'x-format-new': 'true' });
      out.push({ ...step(`${label}: envío ${id}`, shipment, shipment.ok ? `estado ${shipment.json?.status || '?'} / ${shipment.json?.substatus || '-'}` : undefined), sample: shipment.ok ? shipmentSummary(shipment.json) : undefined });
      if (shipment.ok) {
        const items = await call(http, `/shipments/${id}/items`, token);
        out.push({ ...step(`${label}: productos del envío`, items, items.ok ? `${itemsSummary(items.json).length} renglón(es)` : undefined), sample: items.ok ? itemsSummary(items.json) : undefined });
        const history = await call(http, `/shipments/${id}/history`, token);
        const events = Array.isArray(history.json) ? history.json : history.json?.results || history.json?.history || [];
        out.push({ ...step(`${label}: historial del envío (hora de cada cambio)`, history, history.ok ? `${events.length} evento(s)` : undefined), sample: history.ok ? events.slice(0, 8).map((event) => ({ status: event.status ?? null, substatus: event.substatus ?? null, date: event.date_created ?? event.date ?? null })) : undefined });
      }
    }
    // Camino para armar "lo que hay que preparar" sin subir archivos: pedidos pagos de los últimos 2 días y el estado de sus envíos.
    const since = new Date(Date.now() - 2 * 86400000).toISOString();
    const orders = await call(http, `/orders/search?seller=${encodeURIComponent(account.seller_id)}&order.status=paid&order.date_created.from=${encodeURIComponent(since)}&sort=date_desc&limit=30`, token);
    const rows = orders.json?.results || [];
    out.push(step(`${label}: pedidos pagos de los últimos 2 días`, orders, orders.ok ? `${rows.length} pedido(s) en la muestra (de ${orders.json?.paging?.total ?? '?'})` : undefined));
    const counts = {};
    let examined = 0;
    for (const order of rows.slice(0, 12)) {
      const shippingId = order.shipping?.id;
      if (!shippingId) { counts['sin envío'] = (counts['sin envío'] || 0) + 1; continue; }
      const shipment = await call(http, `/shipments/${shippingId}`, token, { 'x-format-new': 'true' });
      examined += 1;
      const key = shipment.ok ? `${shipment.json?.logistic_type || '?'} · ${shipment.json?.status || '?'}/${shipment.json?.substatus || '-'}` : `error ${shipment.status}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    if (rows.length) out.push({ name: `${label}: estados de envío (muestra de ${examined})`, status: 200, ok: true, detail: Object.entries(counts).map(([key, n]) => `${key} ×${n}`).join(' · ') || 'sin envíos' });
  }
  return out;
}
