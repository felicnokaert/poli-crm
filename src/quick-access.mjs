// Poliplast App (26/11, Felipe: «acceso rápido: lo que más usamos, automático o editable»). Cuenta las veces que se
// abre cada pantalla y deja arriba del menú las fijadas (estrella) y después las más usadas, hasta 5.
const KEY = 'poliplast-app-acceso-rapido';
export const QUICK_MAX = 5;

export function readQuick(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage?.getItem(KEY)); return value && typeof value === 'object' ? { uses: value.uses || {}, pins: value.pins || [] } : { uses: {}, pins: [] }; } catch { return { uses: {}, pins: [] }; }
}
export function saveQuick(value, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
export function countUse(value, view) {
  return { ...value, uses: { ...(value.uses || {}), [view]: (Number(value.uses?.[view]) || 0) + 1 } };
}
export function pinToggle(value, id) {
  const pins = value.pins || [];
  return { ...value, pins: pins.includes(id) ? pins.filter((item) => item !== id) : [...pins, id].slice(-QUICK_MAX) };
}
// Fijadas primero; después las más usadas (al menos 3 veces), sin Inicio (ya está arriba); solo las permitidas.
export function quickAccessIds(value, allowedIds = []) {
  const allowed = new Set(allowedIds);
  const pins = (value.pins || []).filter((id) => allowed.has(id));
  const used = Object.entries(value.uses || {}).filter(([id, count]) => allowed.has(id) && id !== 'dashboard' && count >= 3 && !pins.includes(id)).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  return [...pins, ...used].slice(0, QUICK_MAX);
}
