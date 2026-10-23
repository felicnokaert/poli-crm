// Decisiones de Felipe sobre los productos de "Faltan en Shopify" (24/10): "ya existe", "no lo subimos" o "más tarde". Se guardan en
// crm_system_status (key shopify-missing-decisions, un mapa SKU → decisión) para que no vuelvan a aparecer ni se creen por error.
// No toca Shopify ni Mercado Libre.
export const DECISION_KEY = 'shopify-missing-decisions';
export const DECISION_STATES = ['existe', 'no_subir', 'despues'];

export function applyDecision(current = {}, body = {}, by = '', now = new Date().toISOString()) {
  const skus = [...new Set((Array.isArray(body.skus) ? body.skus : []).map((sku) => String(sku || '').trim().toUpperCase()).filter(Boolean))].slice(0, 100);
  if (!skus.length) throw new Error('Falta elegir al menos un SKU.');
  const next = { ...current };
  if (body.state === 'volver') {
    for (const sku of skus) delete next[sku];
    return next;
  }
  if (!DECISION_STATES.includes(body.state)) throw new Error('Decisión desconocida.');
  const note = String(body.note || '').slice(0, 200);
  for (const sku of skus) next[sku] = { state: body.state, note, by, at: now };
  return next;
}

export async function saveDecision(store, body, by) {
  const rows = await store.select(`crm_system_status?select=detail&key=eq.${DECISION_KEY}&limit=1`).catch(() => []);
  const merged = applyDecision(rows?.[0]?.detail || {}, body, by);
  await store.upsert('crm_system_status', [{ key: DECISION_KEY, ok: true, detail: merged, last_run_at: new Date().toISOString() }]);
  return { ok: true, count: Object.keys(merged).length };
}
