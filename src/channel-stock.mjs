// Cruce de stock entre Shopify y Mercado Libre por SKU (3/11, idea de Felipe: «la alerta de sobreventa»).
// Solo lee lo que el CRM ya copió: no necesita conector ni navegador. Dos avisos:
//  - sobreventa: el producto se puede comprar en Shopify (hay stock o vende sin límite) pero todas sus publicaciones
//    de Mercado Libre con ese SKU están pausadas, inactivas o sin stock → probablemente ya no hay mercadería.
//  - reposición: en Shopify está en 0 (y no vende sin stock) pero Mercado Libre lo sigue vendiendo con stock → ventas perdidas.
const norm = (sku) => String(sku || '').trim().toUpperCase();
const isActive = (item) => String(item?.status || '').toLowerCase() === 'active';
const sellable = (variant) => Number(variant.inventory_quantity) > 0 || String(variant.inventory_policy || '').toUpperCase() === 'CONTINUE';

export function channelStock({ products = [], variants = [], mlItems = [] } = {}) {
  const itemsBySku = new Map();
  for (const item of mlItems) {
    const sku = norm(item.sku);
    if (!sku) continue;
    if (!itemsBySku.has(sku)) itemsBySku.set(sku, []);
    itemsBySku.get(sku).push(item);
  }
  const variantsByProduct = new Map();
  for (const variant of variants) {
    if (!variantsByProduct.has(variant.product_id)) variantsByProduct.set(variant.product_id, []);
    variantsByProduct.get(variant.product_id).push(variant);
  }
  const oversell = [];
  const restock = [];
  for (const product of products) {
    if (String(product.status || '').toLowerCase() !== 'active') continue;
    const problems = { oversell: [], restock: [] };
    let sold = 0;
    for (const variant of variantsByProduct.get(product.id) || []) {
      const items = itemsBySku.get(norm(variant.sku));
      if (!items?.length) continue;
      sold += items.reduce((sum, item) => sum + (Number(item.sold_quantity) || 0), 0);
      const mlHasStock = items.some((item) => isActive(item) && Number(item.available_quantity) > 0);
      if (sellable(variant) && !mlHasStock) problems.oversell.push({ sku: norm(variant.sku), why: items.some(isActive) ? 'publicación activa sin stock' : 'publicación pausada o inactiva' });
      if (!sellable(variant) && mlHasStock) problems.restock.push({ sku: norm(variant.sku), why: 'en Shopify está en 0 y en ML tiene stock' });
    }
    const base = { id: product.id, title: product.title || product.handle || String(product.id), sold };
    if (problems.oversell.length) oversell.push({ ...base, variants: problems.oversell });
    if (problems.restock.length) restock.push({ ...base, variants: problems.restock });
  }
  const bySold = (a, b) => b.sold - a.sold;
  return { oversell: oversell.sort(bySold), restock: restock.sort(bySold) };
}

const examples = (list) => list.slice(0, 5).map((item) => `${item.title} (${item.variants.slice(0, 2).map((variant) => variant.sku).join(', ')})`).join('; ');

export function channelStockAlerts(data = {}) {
  const { oversell, restock } = channelStock(data);
  const out = [];
  if (oversell.length) {
    out.push({
      type: 'sobreventa-shopify', entity_id: '', source: 'shopify', severity: oversell.length >= 10 ? 'alta' : 'media',
      title: `${oversell.length} producto${oversell.length === 1 ? '' : 's'} activo${oversell.length === 1 ? '' : 's'} en Shopify con la publicación de Mercado Libre pausada o sin stock (posible sobreventa)`,
      detail: `Se pueden comprar en la tienda pero en ML ya no hay stock. Los de más ventas en ML: ${examples(oversell)}.`, link: { view: 'shopify', tab: 'productos' },
    });
  }
  if (restock.length) {
    out.push({
      type: 'reposicion-shopify', entity_id: '', source: 'shopify', severity: 'media',
      title: `${restock.length} producto${restock.length === 1 ? '' : 's'} en 0 en Shopify que Mercado Libre sigue vendiendo con stock`,
      detail: `Ventas perdidas en la tienda. Los de más ventas en ML: ${examples(restock)}.`, link: { view: 'shopify', tab: 'productos' },
    });
  }
  return out;
}
