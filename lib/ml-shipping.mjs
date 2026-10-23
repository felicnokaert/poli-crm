// Marca los cambios de envío de los competidores antes de guardar sus filas (ver src/ml-shipping-change.mjs).
import { shippingChange } from '../src/ml-shipping-change.mjs';

export async function annotateShipping(store, rows, now = new Date().toISOString()) {
  if (!rows.length) return rows;
  let before = [];
  if (typeof store.select === 'function') {
    try { before = await store.select(`ml_competitor_items?select=id,free_shipping,logistic_type,shipping_change,shipping_changed_at&id=in.(${rows.map((row) => encodeURIComponent(row.id)).join(',')})`); } catch { before = []; }
  }
  const byId = new Map(before.map((row) => [row.id, row]));
  return rows.map((row) => {
    const prev = byId.get(row.id);
    const change = shippingChange(prev, row);
    // Si no cambió hoy se conserva lo anotado antes (el guardado en bloque no debe borrarlo).
    return { ...row, shipping_change: change || prev?.shipping_change || '', shipping_changed_at: change ? now : prev?.shipping_changed_at || null };
  });
}
