import { annotateShipping } from './ml-shipping.mjs';
// Competencia por catálogo de Mercado Libre (23/10). El diagnóstico mostró que Mercado Libre NO deja a nuestra
// app buscar publicaciones ni leer las de otros vendedores (403), pero SÍ deja, para nuestras publicaciones de
// catálogo (las que compiten en una misma página de producto):
//  - GET /items/{id}/price_to_win?siteId=MLA&version=v2 → si ganamos, compartimos o perdemos y el precio para ganar.
//  - GET /products/{id} → el producto y quién gana (buy_box_winner).
//  - GET /products/{id}/items → todas las ofertas del producto (vendedor, precio, envío).
// Las ofertas de otros vendedores se guardan como competencia (ml_competitor_items, added_by 'catalogo', con una
// foto diaria del precio) y nuestro estado en ml_catalog_status. Solo lee.
const num = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
const https = (value) => String(value || '').replace(/^http:\/\//i, 'https://');
export const CATALOG_SOURCE = 'catalogo';

// Lo que devuelve /products/{id}/items: { results: [{ item_id, seller_id, price, ... }] } (o una lista suelta).
export function catalogOffers(body) {
  const list = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : [];
  return list
    .map((offer) => ({
      itemId: String(offer?.item_id || offer?.id || ''),
      sellerId: String(offer?.seller_id ?? offer?.seller?.id ?? ''),
      price: num(offer?.price),
      originalPrice: num(offer?.original_price),
      currency: String(offer?.currency_id || ''),
      freeShipping: Boolean(offer?.shipping?.free_shipping),
      logistic: String(offer?.shipping?.logistic_type || ''),
      officialStore: offer?.official_store_id != null,
    }))
    .filter((offer) => offer.itemId);
}

// Fila de ml_catalog_status para una publicación nuestra de catálogo.
export function catalogStatusRow({ item, ptw, product, offers, ownSellers, nicknames = new Map() }) {
  const others = offers.filter((offer) => !ownSellers.has(offer.sellerId) && offer.price != null);
  const cheapest = others.reduce((best, offer) => (best == null || offer.price < best.price ? offer : best), null);
  const winner = product?.buy_box_winner || null;
  const winnerSeller = String(winner?.seller_id ?? '');
  return {
    item_id: String(item.id),
    seller_id: String(item.seller_id || ''),
    product_id: String(item.catalog_product_id || ''),
    product_name: String(product?.name || item.title || ''),
    permalink: String(product?.permalink || (item.catalog_product_id ? `https://www.mercadolibre.com.ar/p/${item.catalog_product_id}` : '')),
    thumbnail: https(product?.pictures?.[0]?.url || product?.pictures?.[0]?.secure_url || ''),
    our_price: num(ptw?.current_price ?? item.price),
    status: String(ptw?.status || ''),
    price_to_win: num(ptw?.price_to_win),
    visit_share: String(ptw?.visit_share || ''),
    competitors_sharing: num(ptw?.competitors_sharing_first_place),
    winner_item_id: String(winner?.item_id || ptw?.winner?.item_id || ''),
    winner_price: num(winner?.price ?? ptw?.winner?.price),
    winner_seller_id: winnerSeller,
    winner_nickname: String(nicknames.get(winnerSeller) || ''),
    winner_is_ours: winnerSeller ? ownSellers.has(winnerSeller) : null,
    offers_count: offers.length,
    others_count: others.length,
    cheapest_price: cheapest ? cheapest.price : null,
    cheapest_seller_id: cheapest ? cheapest.sellerId : '',
    boosts: Array.isArray(ptw?.boosts) ? ptw.boosts.map((boost) => ({ id: String(boost?.id || ''), status: String(boost?.status || ''), description: String(boost?.description || '') })) : [],
    checked_at: new Date().toISOString(),
  };
}

// Las ofertas de otros vendedores, como filas de ml_competitor_items (mismas columnas siempre).
export function catalogCompetitorRows({ item, product, offers, ownSellers, nicknames = new Map() }) {
  const pid = String(item.catalog_product_id || '');
  return offers
    .filter((offer) => !ownSellers.has(offer.sellerId))
    .map((offer) => ({
      id: offer.itemId,
      seller_id: offer.sellerId,
      seller_nickname: String(nicknames.get(offer.sellerId) || ''),
      our_item_id: String(item.id),
      title: String(product?.name || item.title || ''),
      permalink: String(product?.permalink || (pid ? `https://www.mercadolibre.com.ar/p/${pid}` : '')),
      price: offer.price,
      original_price: offer.originalPrice,
      currency: offer.currency,
      status: 'active',
      thumbnail: https(product?.pictures?.[0]?.url || ''),
      category_id: String(product?.category_id || ''),
      free_shipping: offer.freeShipping,
      logistic_type: offer.logistic,
      added_by: CATALOG_SOURCE,
      checked_at: new Date().toISOString(),
    }));
}

// Nuestras publicaciones de catálogo de una cuenta (hasta `max`).
export async function catalogListingIds(account, { get, token, max = 300 }) {
  const ids = [];
  for (let offset = 0; offset < max; offset += 50) {
    const page = await get(`/users/${encodeURIComponent(account.seller_id)}/items/search?catalog_listing=true&status=active&limit=50&offset=${offset}`, token);
    const found = Array.isArray(page?.results) ? page.results.map(String) : [];
    ids.push(...found);
    if (found.length < 50) break;
  }
  return ids;
}

// Revisa las publicaciones de catálogo `ids` de UNA cuenta (con su token) hasta `deadline`.
// Devuelve cuántas se revisaron (`done`), así se puede seguir en otro pedido.
export async function refreshCatalog(account, ids, { get, token, store, today, ownSellers, deadline = Infinity, pause = 0 }) {
  const nicknames = new Map();
  const nickname = async (sellerId) => {
    if (!sellerId || ownSellers.has(sellerId) || nicknames.has(sellerId)) return;
    nicknames.set(sellerId, await get(`/users/${encodeURIComponent(sellerId)}`, token).then((user) => String(user?.nickname || '')).catch(() => ''));
  };
  let done = 0;
  let saved = 0;
  const errors = [];
  for (let index = 0; index < ids.length; index += 10) {
    if (Date.now() > deadline) break;
    const chunk = ids.slice(index, index + 10);
    const details = await get(`/items?ids=${chunk.join(',')}&attributes=id,title,price,catalog_product_id,seller_id`, token);
    const statusRows = [];
    const competitorRows = [];
    for (const entry of details || []) {
      if (Date.now() > deadline) break;
      done += 1;
      const item = entry?.code === 200 ? { ...entry.body, seller_id: entry.body?.seller_id || account.seller_id } : null;
      if (!item?.id || !item.catalog_product_id) continue;
      try {
        const [ptw, product, offerBody] = await Promise.all([
          get(`/items/${encodeURIComponent(item.id)}/price_to_win?siteId=MLA&version=v2`, token).catch(() => null),
          get(`/products/${encodeURIComponent(item.catalog_product_id)}`, token).catch(() => null),
          // 404 "No winners found" = nadie gana todavía: sin ofertas para mostrar.
          get(`/products/${encodeURIComponent(item.catalog_product_id)}/items?limit=20`, token).catch(() => null),
        ]);
        const offers = catalogOffers(offerBody);
        const sellers = [...new Set([...offers.map((offer) => offer.sellerId), String(product?.buy_box_winner?.seller_id ?? '')])].filter(Boolean);
        for (const sellerId of sellers.slice(0, 12)) await nickname(sellerId);
        statusRows.push(catalogStatusRow({ item, ptw, product, offers, ownSellers, nicknames }));
        competitorRows.push(...catalogCompetitorRows({ item, product, offers, ownSellers, nicknames }));
      } catch (error) {
        errors.push(`${item.id}: ${String(error?.message || error).slice(0, 80)}`);
      }
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    }
    if (statusRows.length) await store.upsert('ml_catalog_status', statusRows);
    // La misma oferta puede aparecer en dos productos nuestros: queda una sola fila.
    const unique = [...new Map(competitorRows.map((row) => [row.id, row])).values()];
    if (unique.length) {
      await store.upsert('ml_competitor_items', await annotateShipping(store, unique));
      await store.upsert('ml_competitor_snapshots', unique.map((row) => ({ item_id: row.id, taken_on: today, price: row.price, sold_quantity: null, available_quantity: null, status: row.status })));
    }
    saved += statusRows.length;
  }
  return { done, saved, errors };
}
