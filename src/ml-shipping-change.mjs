// Cambios de envío de los competidores (24/10): "pasó a Full", "pasó a envío gratis". Compara lo que había guardado con lo
// que trae hoy Mercado Libre. Si antes no se había guardado el tipo de logística no se avisa (sería falsa alarma).
export const LOGISTIC_NAME = { fulfillment: 'Full', cross_docking: 'Colecta', drop_off: 'Places', xd_drop_off: 'Places', self_service: 'Flex', default: 'envío normal' };
const name = (key) => LOGISTIC_NAME[key] || key || 'sin dato';

// prev/next: { free_shipping, logistic_type }. Devuelve el texto del cambio o ''.
export function shippingChange(prev, next) {
  if (!prev || !next) return '';
  const before = String(prev.logistic_type || '');
  const after = String(next.logistic_type || '');
  if (before && after && before !== after) {
    if (after === 'fulfillment') return 'pasó a Full';
    if (before === 'fulfillment') return 'dejó Full';
    return `cambió el envío de ${name(before)} a ${name(after)}`;
  }
  if (prev.free_shipping === false && next.free_shipping === true) return 'pasó a envío gratis';
  if (prev.free_shipping === true && next.free_shipping === false) return 'dejó el envío gratis';
  return '';
}

// Para las alertas: cambios de los últimos `days` días.
export function recentShippingChanges(rows = [], now = Date.now(), days = 7) {
  return rows.filter((row) => row.shipping_change && row.shipping_changed_at && now - Date.parse(row.shipping_changed_at) <= days * 86400000);
}
