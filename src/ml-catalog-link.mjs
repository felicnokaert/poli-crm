// Cruce del catálogo del cotizador con las publicaciones de Mercado Libre por SKU (22/10). Puro: no lee la base.
// El SKU de la publicación (ml_items.sku) y el de la variante del catálogo (catalog_variants.sku) se comparan
// en mayúsculas y sin espacios. Solo muestra: no copia fotos ni cambia nada.
export const normSku = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const bySold = (a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0);

export function linkMlToCatalog({ products = [], variants = [], items = [], onlyActive = true } = {}) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const variantBySku = new Map();
  for (const variant of variants) {
    const sku = normSku(variant.sku);
    if (sku && !variantBySku.has(sku)) variantBySku.set(sku, variant);
  }
  const pool = onlyActive ? items.filter((item) => item.status === 'active') : items;
  const groups = new Map();
  const noSku = [];
  for (const item of pool) {
    const sku = normSku(item.sku);
    if (!sku) { noSku.push(item); continue; }
    if (!groups.has(sku)) groups.set(sku, []);
    groups.get(sku).push(item);
  }

  const matched = [];
  const unmatched = [];
  for (const [sku, list] of groups) {
    list.sort(bySold);
    const variant = variantBySku.get(sku);
    if (variant) {
      const product = productById.get(variant.product_id) || null;
      const thumbnail = list.find((item) => item.thumbnail)?.thumbnail || '';
      matched.push({ sku, variant, product, items: list, thumbnail, needsPhoto: Boolean(thumbnail) && !String(product?.photo_path || '').trim() });
    } else {
      unmatched.push({ sku, items: list });
    }
  }
  matched.sort((a, b) => b.items.length - a.items.length || String(a.sku).localeCompare(String(b.sku)));
  unmatched.sort((a, b) => b.items.length - a.items.length || String(a.sku).localeCompare(String(b.sku)));
  const duplicated = [...matched, ...unmatched].filter((entry) => entry.items.length > 1);

  const matchedItems = matched.reduce((sum, entry) => sum + entry.items.length, 0);
  const summary = {
    activeItems: pool.length,
    withSku: pool.length - noSku.length,
    noSku: noSku.length,
    matchedItems,
    matchedSkus: matched.length,
    unmatchedSkus: unmatched.length,
    unmatchedItems: unmatched.reduce((sum, entry) => sum + entry.items.length, 0),
    duplicatedSkus: duplicated.length,
    catalogSkus: variantBySku.size,
    catalogCovered: matched.length,
    photoGain: matched.filter((entry) => entry.needsPhoto).length,
  };
  return { matched, unmatched, duplicated, noSku, summary };
}
