// Cruce de precios Shopify ↔ Mercado Libre (24/10). Regla de Felipe: precio en Shopify = precio en Mercado Libre menos 10 %.
// Se empareja por SKU. Esto solo PROPONE: no cambia ningún precio (escribir en Shopify necesita su aprobación y permiso).
export const DISCOUNT = 0.10;
export const TOLERANCE = 0.02; // dentro de ±2 % del objetivo se considera bien
export const SUSPECT = 0.5; // diferencias de más del 50 %: casi seguro es otro tamaño o pack con el mismo SKU, se revisa a mano

export const PRICE_STATES = {
  alinear_bajar: ['Shopify más caro que la regla', 'warn'],
  alinear_subir: ['Shopify más barato que la regla', 'warn'],
  ok: ['Dentro de la regla', 'ok'],
  revisar: ['Revisar a mano (diferencia enorme)', 'bad'],
  ml_inactiva: ['Sin oferta activa en Mercado Libre', ''],
  sin_ml: ['No está en Mercado Libre', ''],
  sin_sku: ['Variante sin SKU', ''],
  sin_precio: ['Shopify sin precio', 'bad'],
};

const key = (sku) => String(sku || '').trim().toUpperCase();

// De todas las publicaciones de ML con ese SKU, la de referencia es la activa que más vendió.
function referenceListing(list) {
  const active = list.filter((item) => item.status === 'active' && Number(item.price) > 0);
  const pool = active.length ? active : list;
  return { item: [...pool].sort((a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0))[0], active: active.length > 0 };
}

export function priceCross({ products = [], variants = [], mlItems = [], discount = DISCOUNT } = {}) {
  const bySku = new Map();
  for (const item of mlItems) {
    const sku = key(item.sku);
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(item);
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const rows = [];
  for (const variant of variants) {
    const product = productById.get(variant.product_id);
    if (!product || product.status === 'ARCHIVED') continue;
    const sku = key(variant.sku);
    const shopify = Number(variant.price) || 0;
    const base = { variantId: variant.id, productId: product.id, title: product.title, variantTitle: variant.title && variant.title !== 'Default Title' ? variant.title : '', status: product.status, sku, shopify, compareAt: Number(variant.compare_at_price) || 0, ml: null, target: null, diff: null, proposal: null };
    if (!sku) { rows.push({ ...base, state: 'sin_sku' }); continue; }
    const listings = bySku.get(sku);
    if (!listings?.length) { rows.push({ ...base, state: shopify > 0 ? 'sin_ml' : 'sin_precio' }); continue; }
    const { item, active } = referenceListing(listings);
    const mlPrice = Number(item.price) || 0;
    const ml = { price: mlPrice, itemId: item.id, status: item.status, active, listings: listings.length, title: item.title || '', permalink: item.permalink || '' };
    if (!active || !(mlPrice > 0)) { rows.push({ ...base, ml, state: 'ml_inactiva' }); continue; }
    const target = Math.round(mlPrice * (1 - discount));
    const diff = shopify > 0 ? shopify / target - 1 : null;
    let state = 'ok';
    if (!(shopify > 0)) state = 'sin_precio';
    else if (Math.abs(diff) > SUSPECT) state = 'revisar';
    else if (diff > TOLERANCE) state = 'alinear_bajar';
    else if (diff < -TOLERANCE) state = 'alinear_subir';
    rows.push({ ...base, ml, target, diff, state, proposal: ['alinear_bajar', 'alinear_subir', 'sin_precio'].includes(state) ? target : null });
  }
  return rows;
}

export function priceSummary(rows = []) {
  const count = (state, activeOnly = false) => rows.filter((row) => row.state === state && (!activeOnly || row.status === 'ACTIVE')).length;
  const matched = rows.filter((row) => row.ml).length;
  return {
    total: rows.length, matched, ok: count('ok'), lower: count('alinear_bajar'), raise: count('alinear_subir'), review: count('revisar'),
    inactive: count('ml_inactiva'), noMl: count('sin_ml'), noSku: count('sin_sku'), noPrice: count('sin_precio'),
    toChangeActive: count('alinear_bajar', true) + count('alinear_subir', true) + count('sin_precio', true),
  };
}

export function filterPriceRows(rows = [], { state = '', query = '', activeOnly = true } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (activeOnly && row.status !== 'ACTIVE') return false;
    if (state && row.state !== state) return false;
    if (!words.length) return true;
    const text = `${row.title} ${row.variantTitle} ${row.sku}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
// 26/10 (Felipe): el precio de Mercado Libre queda como precio normal (tachado en la tienda) y la regla ML -10 % es el precio
// con promoción. En Shopify eso es: precio = objetivo y "precio de comparación" = precio de ML. Solo cuentan publicaciones de ML ACTIVAS.
// Lo que difiere de eso más de la tolerancia (precio) o cuyo precio de comparación no es el de ML, entra en la propuesta; las diferencias
// de más del 50 % (casi seguro otro tamaño o pack con el mismo SKU) van marcadas "Revisar a mano" y no se aplican solas.
export const promoChange = (row) => row.ml?.active && row.target != null && (row.proposal != null || Math.round(row.compareAt || 0) !== Math.round(row.ml.price));
export function priceProposalCsv(rows = []) {
  const head = ['SKU', 'Producto', 'Variante', 'Estado del producto', 'Precio Shopify hoy', 'Precio de comparación hoy', 'Precio Mercado Libre (activa)', 'Precio con promo a cargar (ML -10 %)', 'Precio de comparación a cargar (= ML)', 'Diferencia del precio', 'Acción', 'Publicación ML'];
  const lines = rows.filter(promoChange).map((row) => [
    row.sku, row.title, row.variantTitle, row.status, row.shopify || '', row.compareAt || '', row.ml?.price ?? '', row.target ?? '', row.ml?.price ?? '',
    row.diff == null ? '' : `${Math.round(row.diff * 100)} %`,
    row.state === 'revisar' ? 'Revisar a mano (¿mismo SKU en otro tamaño o pack?)' : row.state === 'alinear_bajar' ? 'Bajar precio y tachar el de ML' : row.state === 'alinear_subir' ? 'Subir precio y tachar el de ML' : row.state === 'sin_precio' ? 'Cargar precio y tachar el de ML' : 'Solo tachar el precio de ML',
    row.ml?.permalink || row.ml?.itemId || '',
  ].map(cell).join(','));
  return `\ufeff${[head.map(cell).join(','), ...lines].join('\n')}`;
}
