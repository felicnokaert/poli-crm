// Ventas → Shopify (24/10): qué le falta a cada producto y cómo viene la tienda. Todo sale del espejo de solo lectura
// (shopify_products, shopify_variants y shopify_daily); acá no se llama a Shopify ni se cambia nada.
import { plain } from './knowledge-search.mjs';

export const SHOPIFY_STATUS = { ACTIVE: ['Activo', 'ok'], DRAFT: ['Borrador', ''], ARCHIVED: ['Archivado', ''], UNLISTED: ['No listado', ''] };
export const statusLabel = (status) => SHOPIFY_STATUS[status]?.[0] || status || '—';

// Cada problema: clave, cómo se llama y por qué importa.
export const SHOPIFY_ISSUES = [
  ['sin_descripcion', 'Sin descripción', 'Sin texto no hay SEO ni confianza para comprar.'],
  ['sin_seo', 'Sin título ni descripción SEO', 'Google muestra lo que encuentre; conviene escribirlo.'],
  ['sin_foto', 'Sin fotos', 'Un producto sin foto casi no vende.'],
  ['stock_cero', 'Activo con stock 0', 'Se ve en la tienda pero no se puede comprar (o se vende sin tener).'],
  ['stock_relleno', 'Stock constante (999)', 'Variantes con 900 o más unidades: es el stock constante que se mantiene a propósito. Solo informativo.'],
  ['sin_sku', 'Variantes sin SKU', 'Sin SKU no se puede cruzar con Mercado Libre ni con el catálogo.'],
  ['sku_repetido', 'SKU repetido', 'Dos variantes con el mismo SKU confunden la sincronización de stock y precios.'],
  ['sin_peso', 'Sin peso (no cotiza el envío)', 'Sin el peso de la variante Shopify no calcula el envío y los totales salen mal.'],
  ['precio_cero', 'Precio en $0', 'Algo quedó sin cargar.'],
];
export const issueLabel = (key) => SHOPIFY_ISSUES.find(([id]) => id === key)?.[1] || key;

// Problemas de un producto (solo los activos y borradores cuentan para "stock 0").
export function issuesOf(product, variants = [], skuCounts = new Map()) {
  const issues = [];
  const active = product.status === 'ACTIVE';
  if ((product.description_length || 0) < 20) issues.push('sin_descripcion');
  if (!product.seo_title && !product.seo_description) issues.push('sin_seo');
  if (!(product.media_count > 0)) issues.push('sin_foto');
  // Las variantes con "seguir vendiendo sin stock" no cuentan: se pueden comprar igual.
  const sellsWithoutStock = variants.some((variant) => variant.inventory_policy === 'CONTINUE');
  if (active && !(product.total_inventory > 0) && !sellsWithoutStock) issues.push('stock_cero');
  if (active && variants.some((variant) => variant.weight_grams === 0)) issues.push('sin_peso');
  if (variants.some((variant) => (variant.inventory_quantity || 0) >= 900)) issues.push('stock_relleno');
  if (variants.some((variant) => !variant.sku)) issues.push('sin_sku');
  if (variants.some((variant) => variant.sku && (skuCounts.get(variant.sku) || 0) > 1)) issues.push('sku_repetido');
  if (variants.some((variant) => !(variant.price > 0))) issues.push('precio_cero');
  return issues;
}

// Arma la lista de productos con sus variantes y problemas.
export function boardRows(products = [], variants = []) {
  const byProduct = new Map();
  const skuCounts = new Map();
  for (const variant of variants) {
    if (!byProduct.has(variant.product_id)) byProduct.set(variant.product_id, []);
    byProduct.get(variant.product_id).push(variant);
    if (variant.sku) skuCounts.set(variant.sku, (skuCounts.get(variant.sku) || 0) + 1);
  }
  return products.map((product) => {
    const list = byProduct.get(product.id) || [];
    const prices = list.map((variant) => variant.price).filter((price) => typeof price === 'number' && price > 0);
    return {
      product, variants: list, issues: issuesOf(product, list, skuCounts),
      minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null,
    };
  });
}

export function summarize(rows = []) {
  const count = (predicate) => rows.filter(predicate).length;
  const issueCounts = Object.fromEntries(SHOPIFY_ISSUES.map(([key]) => [key, rows.filter((row) => row.issues.includes(key) && row.product.status === 'ACTIVE').length]));
  return {
    total: rows.length,
    active: count((row) => row.product.status === 'ACTIVE'),
    draft: count((row) => row.product.status === 'DRAFT'),
    other: count((row) => !['ACTIVE', 'DRAFT'].includes(row.product.status)),
    variants: rows.reduce((sum, row) => sum + row.variants.length, 0),
    withIssues: count((row) => row.product.status === 'ACTIVE' && row.issues.length > 0),
    issueCounts,
  };
}

export const SHOPIFY_SORTS = [['titulo', 'Nombre'], ['problemas', 'Más problemas'], ['stock', 'Menos stock'], ['precio', 'Mayor precio'], ['recientes', 'Cambiados hace poco']];

export function filterRows(rows = [], { status = '', issue = '', query = '', sort = 'titulo', vendor = '', type = '', stock = '' } = {}) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const out = rows.filter((row) => {
    if (status && row.product.status !== status) return false;
    if (issue && !row.issues.includes(issue)) return false;
    if (vendor && row.product.vendor !== vendor) return false;
    if (type && row.product.product_type !== type) return false;
    if (stock === 'cero' && (row.product.total_inventory ?? 0) > 0) return false;
    if (stock === 'con' && !((row.product.total_inventory ?? 0) > 0)) return false;
    if (!words.length) return true;
    const haystack = plain(`${row.product.title} ${row.product.vendor} ${row.product.product_type} ${row.product.tags} ${row.variants.map((variant) => variant.sku).join(' ')}`);
    return words.every((word) => haystack.includes(word));
  });
  const by = {
    titulo: (a, b) => a.product.title.localeCompare(b.product.title, 'es'),
    problemas: (a, b) => b.issues.length - a.issues.length || a.product.title.localeCompare(b.product.title, 'es'),
    stock: (a, b) => (a.product.total_inventory ?? Infinity) - (b.product.total_inventory ?? Infinity),
    precio: (a, b) => (b.maxPrice ?? 0) - (a.maxPrice ?? 0),
    recientes: (a, b) => String(b.product.shopify_updated_at || '').localeCompare(String(a.product.shopify_updated_at || '')),
  }[sort] || (() => 0);
  return out.sort(by);
}

// Pedidos y facturado de los últimos N días contra los N anteriores.
export function periodTotals(days = [], length = 7, today) {
  const end = Date.parse(today);
  const within = (from, to) => days.filter((day) => { const time = Date.parse(String(day.day).slice(0, 10)); return time > end - to * 86400000 && time <= end - from * 86400000; });
  const sum = (list) => ({ orders: list.reduce((total, day) => total + (day.orders || 0), 0), amount: list.reduce((total, day) => total + (Number(day.amount) || 0), 0) });
  const now = sum(within(0, length));
  const before = sum(within(length, length * 2));
  const change = (a, b) => (b > 0 ? (a - b) / b : null);
  return { current: now, previous: before, ordersChange: change(now.orders, before.orders), amountChange: change(now.amount, before.amount) };
}

// Marcas y tipos que existen, para los filtros.
export function facets(rows = []) {
  const list = (key) => [...new Set(rows.map((row) => row.product[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return { vendors: list('vendor'), types: list('product_type') };
}

// CSV de lo que se ve (una fila por producto).
const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
export function productsCsv(rows = []) {
  const head = ['Producto', 'Estado', 'Marca', 'Tipo', 'Variantes', 'Precio mínimo', 'Precio máximo', 'Stock', 'SKUs', 'Le falta', 'Link'];
  const lines = rows.map((row) => [
    row.product.title, statusLabel(row.product.status), row.product.vendor, row.product.product_type, row.variants.length, row.minPrice, row.maxPrice, row.product.total_inventory,
    row.variants.map((variant) => variant.sku).filter(Boolean).join(' '), row.issues.map(issueLabel).join(' | '), row.product.online_url,
  ].map(cell).join(','));
  return `\uFEFF${[head.map(cell).join(','), ...lines].join('\n')}`;
}

// Serie por día de los últimos `length` días (fecha argentina), con ceros en los días sin pedidos, para el gráfico.
export function dailySeries(days = [], length = 30, today) {
  const byDay = new Map(days.map((entry) => [String(entry.day).slice(0, 10), entry]));
  const out = [];
  for (let back = length - 1; back >= 0; back -= 1) {
    const day = new Date(Date.parse(today) - back * 86400000).toISOString().slice(0, 10);
    const entry = byDay.get(day);
    out.push({ day, orders: entry?.orders || 0, amount: Number(entry?.amount) || 0, currency: entry?.currency || 'ARS' });
  }
  return out;
}
