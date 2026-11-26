// Poliplast App (26/11, Felipe: «el cotizador está muy verde: poder editar precios y condiciones, USD, minorista y
// mayorista, con sus condiciones»). Lógica de la edición de precios de lista (solo administradores; la base ya lo
// exige: price_lists/variant_prices/payment_policies/wholesale_order_policies se escriben solo con is_poliplast_crm_admin).
// - Los importes son FINALES con IVA, en la moneda de la lista (hoy todas en USD), como lee el cotizador.
// - Un producto tiene tramos por cantidad: «desde N» (y «hasta M» opcional). La base no admite dos precios con el mismo
//   «desde» en la misma lista, así que un tramo que cambia de precio se ACTUALIZA y queda anotado el precio anterior.

export const isWholesaleList = (list = {}) => /mayorista|distribuidor/i.test(list.name || '');
const num = (value) => (value === '' || value == null ? null : Number(String(value).replace(',', '.')));

// tiers: [{ from, to, amount }] como los escribe la persona. Devuelve { tiers ordenados, error }.
export function validateTiers(input = []) {
  const tiers = input
    .map((tier) => ({ id: tier.id || null, from: num(tier.from), to: num(tier.to), amount: num(tier.amount) }))
    .filter((tier) => tier.from != null || tier.amount != null);
  for (const tier of tiers) {
    if (!(tier.from >= 1) || !Number.isFinite(tier.from)) return { error: 'Cada tramo arranca en 1 unidad o más.' };
    if (!(tier.amount > 0)) return { error: 'Cada tramo necesita un precio mayor a 0.' };
    if (tier.to != null && !(tier.to >= tier.from)) return { error: `El tramo desde ${tier.from} termina antes de empezar.` };
  }
  tiers.sort((a, b) => a.from - b.from);
  for (let index = 1; index < tiers.length; index += 1) {
    const prev = tiers[index - 1];
    if (tiers[index].from === prev.from) return { error: `Hay dos tramos que arrancan en ${prev.from}.` };
    if (prev.to == null || prev.to >= tiers[index].from) return { error: `El tramo desde ${prev.from} se pisa con el que arranca en ${tiers[index].from}: poné «hasta» ${tiers[index].from - 1}.` };
  }
  return { tiers };
}

// Compara los tramos guardados (filas de variant_prices) con los nuevos. Devuelve qué insertar, actualizar y borrar.
export function diffTiers(stored = [], next = [], { who = '', today = '' } = {}) {
  const byFrom = new Map(stored.map((row) => [Number(row.min_quantity), row]));
  const keep = new Set();
  const insert = [];
  const update = [];
  for (const tier of next) {
    const row = byFrom.get(tier.from);
    if (!row) { insert.push({ min_quantity: tier.from, max_quantity: tier.to, amount: tier.amount }); continue; }
    keep.add(row.id);
    const sameMax = (row.max_quantity == null ? null : Number(row.max_quantity)) === tier.to;
    if (Number(row.amount) === tier.amount && sameMax) continue;
    const note = Number(row.amount) !== tier.amount ? `antes ${Number(row.amount)}` : 'cambió el tramo';
    update.push({ id: row.id, max_quantity: tier.to, amount: tier.amount, status: 'confirmado', override_reason: `Editado en Poliplast App por ${who || 'admin'} el ${today} (${note})` });
  }
  const remove = stored.filter((row) => !keep.has(row.id)).map((row) => row.id);
  return { insert, update, remove, changed: insert.length + update.length + remove.length > 0 };
}

// Filas guardadas de una variante agrupadas por lista (solo las confirmadas/excepciones, como lee el cotizador).
export function tiersByList(prices = [], lists = []) {
  return lists.map((list) => ({
    list,
    rows: prices.filter((row) => row.price_list_id === list.id && ['confirmado', 'excepcion_manual', 'pendiente'].includes(row.status))
      .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity)),
  }));
}

export function validatePayment(input = {}) {
  const discount = num(input.discount_percent) ?? 0;
  const surcharge = num(input.surcharge_percent) ?? 0;
  if (!String(input.name || '').trim()) return { error: 'Poné el nombre de la forma de pago.' };
  if (discount < 0 || discount > 100) return { error: 'El descuento va de 0 a 100 %.' };
  if (surcharge < 0 || surcharge > 300) return { error: 'El recargo no puede ser negativo.' };
  if (discount > 0 && surcharge > 0) return { error: 'Elegí descuento o recargo, no los dos.' };
  return { payment: { name: String(input.name).trim(), customer_text: String(input.customer_text || '').trim(), discount_percent: discount, surcharge_percent: surcharge, active: input.active !== false } };
}

export function validateMinimum(input = {}) {
  const threshold = num(input.threshold_net_usd);
  if (!String(input.brand || '').trim()) return { error: 'Poné la marca.' };
  if (!(threshold > 0)) return { error: 'El mínimo tiene que ser mayor a 0 (USD neto).' };
  return { minimum: { brand: String(input.brand).trim(), threshold_net_usd: threshold, mix_products: input.mix_products !== false, active: input.active !== false } };
}
