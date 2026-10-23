// Seguimiento de la competencia en Mercado Libre (23/10, Felipe: "el seguimiento de la competencia me
// gustaría tenerlo"; objetivo: superar a Administrado + Real Trends). Solo lectura:
//  - Publicaciones de competidores que Felipe pega (links o MLA…): precio, vendidas, stock y estado, con una
//    foto por día (ml_competitor_snapshots) para ver cuánto venden y cómo mueven el precio.
//  - Tendencias de búsqueda de las categorías donde vendemos (GET /trends/MLA/{categoría}).
// Mercado Libre puede no mostrar las vendidas exactas de otros vendedores: se guarda lo que devuelva.
const COMPETITOR_FIELDS = 'id,title,permalink,price,original_price,currency_id,sold_quantity,available_quantity,status,seller_id,thumbnail,secure_thumbnail,category_id,listing_type_id,shipping';
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const https = (value) => String(value || '').replace(/^http:\/\//i, 'https://');

// "https://articulo.mercadolibre.com.ar/MLA-123456789-espuma..." o "MLA123456789" → MLA123456789.
// Los links de catálogo (/p/MLA…) son productos, no publicaciones: se avisan aparte.
export function competitorIds(text = '') {
  const ids = new Set();
  const products = new Set();
  for (const match of String(text).matchAll(/(\/p\/)?\bMLA-?(\d{6,})/gi)) {
    if (match[1]) products.add(`MLA${match[2]}`);
    else ids.add(`MLA${match[2]}`);
  }
  return { ids: [...ids], products: [...products] };
}

export function competitorRow(body, nickname = '') {
  return {
    id: String(body.id),
    seller_id: String(body.seller_id || ''),
    seller_nickname: String(nickname || ''),
    title: String(body.title || ''),
    permalink: String(body.permalink || ''),
    price: num(body.price),
    original_price: num(body.original_price),
    currency: String(body.currency_id || ''),
    sold_quantity: num(body.sold_quantity),
    available_quantity: num(body.available_quantity),
    status: String(body.status || ''),
    thumbnail: https(body.secure_thumbnail || body.thumbnail),
    category_id: String(body.category_id || ''),
    free_shipping: Boolean(body.shipping?.free_shipping),
    checked_at: new Date().toISOString(),
  };
}

// Trae y guarda el estado de hoy de las publicaciones pedidas (de a 20 por pedido, como pide ML).
export async function refreshCompetitors(ids, { get, token, store, today, extra = {} }) {
  const rows = [];
  const missing = [];
  const nicknames = new Map();
  for (let index = 0; index < ids.length; index += 20) {
    const chunk = ids.slice(index, index + 20);
    const details = await get(`/items?ids=${chunk.join(',')}&attributes=${COMPETITOR_FIELDS}`, token);
    for (const entry of details || []) {
      if (entry?.code !== 200 || !entry.body?.id) { missing.push(String(entry?.body?.id || entry?.id || '')); continue; }
      const sellerId = String(entry.body.seller_id || '');
      if (sellerId && !nicknames.has(sellerId)) nicknames.set(sellerId, await get(`/users/${sellerId}`, token).then((user) => user?.nickname || '').catch(() => ''));
      rows.push({ ...competitorRow(entry.body, nicknames.get(sellerId)), ...extra });
    }
  }
  if (rows.length) {
    await store.upsert('ml_competitor_items', rows);
    await store.upsert('ml_competitor_snapshots', rows.map((row) => ({ item_id: row.id, taken_on: today, price: row.price, sold_quantity: row.sold_quantity, available_quantity: row.available_quantity, status: row.status })));
  }
  return { saved: rows.length, missing: missing.filter(Boolean) };
}

// Tendencias: lo más buscado en cada categoría donde tenemos publicaciones activas.
export async function refreshTrends(categoryIds, { get, token, store, today }) {
  const rows = [];
  const errors = [];
  for (const categoryId of categoryIds) {
    try {
      const [trends, category] = await Promise.all([
        get(`/trends/MLA/${categoryId}`, token),
        get(`/categories/${categoryId}`, token).catch(() => null),
      ]);
      const keywords = (Array.isArray(trends) ? trends : []).slice(0, 50).map((trend, index) => ({ keyword: String(trend.keyword || ''), url: String(trend.url || ''), rank: index + 1 })).filter((trend) => trend.keyword);
      rows.push({ category_id: categoryId, taken_on: today, category_name: String(category?.name || ''), path: (category?.path_from_root || []).map((part) => part.name).join(' > '), keywords });
    } catch (error) {
      errors.push(`${categoryId}: ${String(error?.message || error).slice(0, 80)}`);
    }
  }
  if (rows.length) await store.upsert('ml_trends', rows);
  return { saved: rows.length, errors };
}
