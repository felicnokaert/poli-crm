// Ventas → Mercado Libre → "Stock y ganancia" (23/10). Por publicación activa, con lo vendido en 30 días:
//  - Reposición: ritmo de venta por día y para cuántos días alcanza el stock.
//  - Ganancia: lo que queda por unidad después de la comisión de ML y del envío (muestra de una venta), contra
//    el precio de lista vigente del cotizador (por SKU) y, si Felipe cargó el costo, el margen.
// Los precios de ML y de la lista son FINALES con IVA; el costo se carga + IVA (como la memoria de precios).
import { plain } from './knowledge-search.mjs';

export const RESTOCK_DAYS = 15;
const round = (value) => Math.round(value * 100) / 100;

export function economicsView({ items = [], economics = [], listPrices = {}, skus = {}, seller = '', vat = 0.21 } = {}) {
  const byId = new Map(economics.map((row) => [String(row.id), row]));
  const rows = [];
  for (const item of items) {
    if (!item || item.status !== 'active' || (seller && String(item.seller_id) !== String(seller))) continue;
    const e = byId.get(String(item.id)) || null;
    const units = Number(e?.units_30d) || 0;
    const perDay = units / 30;
    const stock = typeof item.available_quantity === 'number' ? item.available_quantity : null;
    const daysLeft = perDay > 0 && stock != null ? Math.floor(stock / perDay) : null;
    const unitPrice = units ? Number(e.revenue_30d) / units : (typeof item.price === 'number' ? item.price : null);
    const feePerUnit = units ? Number(e.fees_30d) / units : null;
    const shipping = e?.shipping_per_unit == null ? null : Number(e.shipping_per_unit);
    const net = unitPrice != null && feePerUnit != null ? unitPrice - feePerUnit - (shipping || 0) : null;
    const sku = skus[item.id] || '';
    const list = sku ? listPrices[sku] || null : null;
    const cost = e?.unit_cost == null ? null : Number(e.unit_cost);
    const netWithoutVat = net == null ? null : net / (1 + vat);
    rows.push({
      item, sku, units, perDay: round(perDay), stock, daysLeft,
      restock: stock === 0 && units > 0 ? 'sin stock' : daysLeft != null && daysLeft <= RESTOCK_DAYS ? `${daysLeft} días` : '',
      unitPrice: unitPrice == null ? null : round(unitPrice),
      feePerUnit: feePerUnit == null ? null : round(feePerUnit),
      feePct: feePerUnit != null && unitPrice ? Math.round((feePerUnit / unitPrice) * 1000) / 10 : null,
      shipping,
      net: net == null ? null : round(net),
      netPct: net != null && unitPrice ? Math.round((net / unitPrice) * 1000) / 10 : null,
      list,
      vsList: net != null && list?.gross ? Math.round(((net - list.gross) / list.gross) * 1000) / 10 : null,
      cost,
      margin: netWithoutVat != null && cost != null ? round(netWithoutVat - cost) : null,
      marginPct: netWithoutVat != null && cost != null && netWithoutVat > 0 ? Math.round(((netWithoutVat - cost) / netWithoutVat) * 1000) / 10 : null,
      revenue: units ? Number(e.revenue_30d) : 0,
    });
  }
  const restock = rows.filter((row) => row.restock).sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1) || b.units - a.units);
  const selling = rows.filter((row) => row.units > 0).sort((a, b) => b.revenue - a.revenue);
  const totals = selling.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, fees: sum.fees + (row.feePerUnit || 0) * row.units, shipping: sum.shipping + (row.shipping || 0) * row.units }), { revenue: 0, fees: 0, shipping: 0 });
  return {
    rows, restock, selling,
    belowList: selling.filter((row) => row.vsList != null && row.vsList < 0).sort((a, b) => a.vsList - b.vsList),
    totals: { ...totals, net: totals.revenue - totals.fees - totals.shipping, withShipping: selling.filter((row) => row.shipping != null).length, selling: selling.length },
  };
}

// Precio de lista para comparar: la lista minorista (no mayorista) desde 1 unidad.
export function retailPrice(entry) {
  const rows = entry?.rows || [];
  return rows.find((row) => !row.wholesale && row.from <= 1) || rows.find((row) => !row.wholesale) || null;
}

export const asksMlEconomics = (query) => /\b(stock|reponer|reposicion|sin stock|se termina|se acaba|ganancia\w*|rentab\w*|margen\w*|comision\w*|nos queda|me queda|deja plata|dejan plata|cuanto ganamos)\b/.test(plain(query));

export function economicsContext(view, nickname = {}, { max = 8 } = {}) {
  if (!view?.selling?.length) return '';
  const money = (value) => (typeof value === 'number' ? `$ ${Math.round(value).toLocaleString('es-AR')}` : '—');
  const name = (row) => `${String(row.item.title).slice(0, 60)} (${nickname[row.item.seller_id] || 'cuenta'})`;
  const lines = [`STOCK Y GANANCIA EN MERCADO LIBRE (ventas de 30 días; precios finales con IVA; comisión real de cada venta; envío de una venta de muestra): facturado ${money(view.totals.revenue)}, comisiones ${money(view.totals.fees)}, envíos ${money(view.totals.shipping)} (${view.totals.withShipping} de ${view.totals.selling} con envío medido), queda ${money(view.totals.net)}.`];
  if (view.restock.length) lines.push('- Para reponer (el stock alcanza 15 días o menos al ritmo de venta):', ...view.restock.slice(0, max).map((row) => `  · ${name(row)}: ${row.restock === 'sin stock' ? 'SIN STOCK' : `stock ${row.stock}, alcanza ${row.restock}`}, vende ${row.perDay}/día`));
  if (view.belowList.length) lines.push('- En ML queda menos que el precio de lista del cotizador:', ...view.belowList.slice(0, max).map((row) => `  · ${name(row)}: queda ${money(row.net)} por unidad (${row.netPct} % del precio) contra lista ${money(row.list.gross)} (${row.vsList} %)`));
  lines.push('- Las que más facturan:', ...view.selling.slice(0, 5).map((row) => `  · ${name(row)}: ${row.units} u., queda ${money(row.net)} por unidad (comisión ${row.feePct ?? '—'} %${row.shipping != null ? `, envío ${money(row.shipping)}` : ''})${row.margin != null ? `, margen ${money(row.margin)} + IVA (${row.marginPct} %)` : ''}`));
  return lines.join('\n');
}
