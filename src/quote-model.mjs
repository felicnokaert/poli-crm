// Poliplast App (26/11): cotizador propio, adentro de la app. Usa el MISMO catálogo y las MISMAS listas que el
// cotizador de siempre (catalog_variants, price_lists, variant_prices; todo en USD) y suma como referencia lo que
// sale en Mercado Libre y Shopify por SKU. Una cotización NO es una venta: no guarda nada en Ventas.
// Reglas:
// - Importes de lista = FINALES con IVA; neto = importe / (1 + IVA). Sin IVA cargado en la lista se usa 21 %.
// - Minorista = lista que no dice mayorista/distribuidor; mayorista = la que sí. El tramo se elige por cantidad.
// - Mínimo mayorista por marca (wholesale_order_policies, ej. Penosil USD 1.800 neto): si no se llega, se avisa.
// - Forma de pago (payment_policies): descuento o recargo en %.

export const MODES = [['minorista', 'Minorista'], ['mayorista', 'Mayorista']];

// rows: las de currentListPrices (gross, net, vat, from, to, wholesale, currency, list).
export function pickRow(rows = [], mode = 'minorista', quantity = 1) {
  const wholesale = mode === 'mayorista';
  const candidates = rows.filter((row) => row.wholesale === wholesale);
  const pool = candidates.length ? candidates : rows; // si no hay lista de ese tipo, cae en la que haya
  const qty = Number(quantity) || 1;
  const fits = pool.filter((row) => qty >= row.from && (row.to == null || qty <= row.to));
  const chosen = (fits.length ? fits : pool).slice().sort((a, b) => b.from - a.from)[0] || null;
  return chosen ? { ...chosen, fallback: !candidates.length } : null;
}

export function lineTotals(line) {
  const qty = Number(line.quantity) || 0;
  const row = line.row;
  if (!row) return { net: 0, gross: 0, vat: 0 };
  const net = row.net * qty;
  const gross = row.gross * qty;
  return { net, gross, vat: gross - net };
}

export function quoteTotals(lines = [], { payment = null } = {}) {
  const base = lines.reduce((acc, line) => {
    const total = lineTotals(line);
    return { net: acc.net + total.net, gross: acc.gross + total.gross };
  }, { net: 0, gross: 0 });
  const discount = Number(payment?.discount_percent) || 0;
  const surcharge = Number(payment?.surcharge_percent) || 0;
  const factor = 1 - discount / 100 + surcharge / 100;
  return { net: base.net * factor, gross: base.gross * factor, vat: (base.gross - base.net) * factor, factor, discount, surcharge };
}

// Avisos de mínimo mayorista por marca (neto USD, mezclando productos de la marca si la política lo permite).
export function wholesaleWarnings(lines = [], policies = []) {
  const out = [];
  for (const policy of policies.filter((item) => item.active !== false)) {
    const brand = String(policy.brand || '').toLowerCase();
    const mine = lines.filter((line) => line.mode === 'mayorista' && String(line.brand || '').toLowerCase().includes(brand));
    if (!mine.length) continue;
    const net = mine.reduce((sum, line) => sum + lineTotals(line).net, 0);
    const min = Number(policy.threshold_net_usd) || 0;
    if (net < min) out.push({ brand: policy.brand, net, min, missing: min - net });
  }
  return out;
}

export const usd = (value) => `USD ${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const ars = (value) => `$ ${Math.round(Number(value) || 0).toLocaleString('es-AR')}`;

export function whatsappText({ client = '', lines = [], totals, dollar = null, payment = null, validDays = 7, seller = '' }) {
  const head = [`*Cotización Grupo Poliplast*${client ? ` · ${client}` : ''}`];
  const body = lines.filter((line) => line.row).map((line) => `• ${line.quantity} × ${line.name}${line.sku ? ` (${line.sku})` : ''}: ${usd(line.row.gross)} c/u final · ${usd(lineTotals(line).gross)}`);
  const foot = [`*Total: ${usd(totals.gross)}* (IVA incluido; neto ${usd(totals.net)} + IVA)`];
  if (dollar?.rate) foot.push(`Equivale a ${ars(totals.gross * dollar.rate)} al dólar BNA ${ars(dollar.rate)}.`);
  if (payment?.name) foot.push(`Forma de pago: ${payment.name}${payment.customer_text ? ` (${payment.customer_text})` : ''}.`);
  foot.push(`Precios válidos por ${validDays} días, sujetos a stock.`);
  if (seller) foot.push(seller);
  return [...head, '', ...body, '', ...foot].join('\n');
}

// Referencia de canales por SKU: la publicación ACTIVA de ML que más vendió y la variante de Shopify.
export function channelRefs(sku, { mlItems = [], shopVariants = [] } = {}) {
  const key = String(sku || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!key) return { ml: null, shopify: null };
  const ml = mlItems
    .filter((item) => item.status === 'active' && (String(item.sku || '').toUpperCase() === key || (item.variation_skus || []).some((variation) => String(variation?.sku || '').toUpperCase() === key)))
    .sort((a, b) => (b.sold_quantity || 0) - (a.sold_quantity || 0))[0] || null;
  const shopify = shopVariants.find((variant) => String(variant.sku || '').trim().toUpperCase() === key) || null;
  return {
    ml: ml ? { price: Number(ml.price), title: ml.title, permalink: ml.permalink, sold: ml.sold_quantity || 0 } : null,
    shopify: shopify ? { price: Number(shopify.price), compareAt: shopify.compare_at_price ? Number(shopify.compare_at_price) : null } : null,
  };
}

// Seguimiento a N días hábiles (sin sábados ni domingos), en fecha argentina.
export function businessDaysFromToday(days = 2, now = Date.now()) {
  let date = new Date(Number(now) - 3 * 3600000);
  let left = days;
  while (left > 0) {
    date = new Date(date.getTime() + 86400000);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}
