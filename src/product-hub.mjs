// 20/11 (Felipe: «relacionar productos, cotizador, calidad, descripciones, preguntas… que el CRM sea hiper
// inteligente: qué está en tendencia, qué publicación gana, si con el mismo SKU conviene Shopify, cuotas en ML,
// un pago o por fuera»). Vista por SKU que junta:
// - Cotizador: nombre, foto y precio de lista vigente (USD → pesos con el dólar BNA del día).
// - Mercado Libre: cada publicación activa del SKU (cuenta, Clásica o Premium = cuotas sin interés, precio,
//   comisión REAL de las ventas de 30 días, envío medido, lo que queda por unidad, calidad, experiencia de
//   compra, catálogo ganado/perdido, visitas en alza, preguntas).
// - Shopify: precio, precio tachado y stock de la variante con ese SKU.
// - Tendencias: búsquedas en alza de la categoría que nombran el producto.
// Y arma «dónde conviene» (lo que queda por unidad en cada canal) y avisos (⚠ precio raro, catálogo perdido…).
// Solo lee y calcula: no cambia nada en ningún canal. Nunca inventa: lo que no está medido queda «sin medir».

export const normSku = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const plain = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const round = (value) => (value == null || !Number.isFinite(value) ? null : Math.round(value));

export const LISTING_TYPES = {
  gold_pro: { short: 'Premium', label: 'Premium (cuotas sin interés)' },
  gold_special: { short: 'Clásica', label: 'Clásica (un pago o cuotas con interés del comprador)' },
};
export const listingLabel = (type) => LISTING_TYPES[type]?.label || (type ? String(type) : 'sin dato');
export const listingShort = (type) => LISTING_TYPES[type]?.short || (type ? String(type) : '—');

// Fuera de este rango entre el precio de ML y el de lista (en pesos con IVA) casi seguro hay un error de carga
// o el SKU es de otro producto (otro tamaño, pack o kit). Con la comisión, ML suele estar entre 1 y 1,6 veces.
export const RARE_PRICE = { low: 0.5, high: 2.5 };

function itemSkus(item) {
  const own = normSku(item?.sku);
  const fromVariations = (Array.isArray(item?.variation_skus) ? item.variation_skus : []).map((entry) => normSku(entry?.sku)).filter(Boolean);
  return [...new Set([own, ...fromVariations].filter(Boolean))];
}

const words = (text) => plain(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 4);

// Una búsqueda en tendencia «nombra» el producto si al menos 2 de sus palabras (o la única) están en el título.
export function trendFor(title, keywords = []) {
  const titleWords = new Set(words(title));
  for (const entry of keywords) {
    const keyword = typeof entry === 'string' ? entry : entry?.keyword;
    const own = words(keyword);
    if (!own.length) continue;
    const hits = own.filter((word) => titleWords.has(word)).length;
    if (hits >= Math.min(2, own.length)) return { keyword, rank: entry?.rank ?? null };
  }
  return null;
}

// Lo que queda de una venta en ML: precio − comisión real (de las ventas de 30 días) − envío que paga el vendedor.
export function mlListing(item, { economics, health, catalog, nickname, questions = 0, trends } = {}) {
  const price = Number(item.price) || 0;
  const units = Number(economics?.units_30d) || 0;
  const revenue = Number(economics?.revenue_30d) || 0;
  const fees = Number(economics?.fees_30d) || 0;
  const feePct = revenue > 0 && fees >= 0 ? (fees / revenue) * 100 : null;
  const shipping = economics?.shipping_per_unit == null ? null : Number(economics.shipping_per_unit);
  const net = feePct == null ? null : price - (price * feePct) / 100 - (shipping || 0);
  const visits7 = Number(item.visits_7d) || 0;
  const visits30 = Number(item.visits_30d) || 0;
  const rising = visits30 >= 20 && visits7 * (30 / 7) >= visits30 * 1.3;
  const trend = trends ? trendFor(item.title, trends[item.category_id] || []) : null;
  return {
    id: item.id,
    account: nickname || String(item.seller_id || ''),
    title: item.title || '',
    permalink: item.permalink || '',
    thumbnail: item.thumbnail || '',
    status: item.status,
    type: item.listing_type || '',
    price,
    stock: item.available_quantity == null ? null : Number(item.available_quantity),
    units30: units,
    sold: Number(item.sold_quantity) || 0,
    visits7, visits30, rising,
    feePct: feePct == null ? null : Math.round(feePct * 10) / 10,
    shipping: round(shipping),
    net: round(net),
    quality: health?.quality_level || null,
    qualityScore: health?.quality_score ?? null,
    px: health?.px_color || null,
    catalog: catalog ? {
      status: catalog.status,
      winning: catalog.status === 'winning' || catalog.winner_is_ours === true,
      priceToWin: catalog.price_to_win == null ? null : Number(catalog.price_to_win),
      winnerPrice: catalog.winner_price == null ? null : Number(catalog.winner_price),
      winner: catalog.winner_nickname || null,
    } : null,
    questions,
    trend,
  };
}

/**
 * variants: catálogo del cotizador [{id, sku, name, product_id}]
 * listPrices: { SKU: {gross, currency, vat} } (lista minorista vigente)
 * photos: { product_id: url }
 * items: ml_items; economics/health/catalog: mapas por id de publicación; questions: { item_id: n }
 * shopify: [{sku, price, compare_at_price, inventory_quantity, status, title}]
 * trends: { category_id: [{keyword, rank}] }; nickname: { seller_id: apodo }; dollar: pesos por USD (BNA)
 */
export function buildProductHub({ variants = [], listPrices = {}, photos = {}, items = [], economics = {}, health = {}, catalog = {}, questions = {}, shopify = [], trends = {}, nickname = {}, dollar = null } = {}) {
  const bySku = new Map();
  const entry = (sku) => {
    if (!bySku.has(sku)) bySku.set(sku, { sku, name: '', productId: null, photo: '', list: null, ml: [], shopify: [] });
    return bySku.get(sku);
  };
  for (const variant of variants) {
    const sku = normSku(variant.sku);
    if (!sku) continue;
    const row = entry(sku);
    row.name = variant.name || row.name;
    row.productId = variant.product_id || row.productId;
    row.photo = photos[variant.product_id] || row.photo;
    const price = listPrices[sku];
    if (price) {
      const gross = Number(price.gross);
      const ars = price.currency === 'USD' ? (dollar ? gross * dollar : null) : gross;
      row.list = { gross, currency: price.currency || 'ARS', ars: round(ars) };
    }
  }
  for (const item of items) {
    if (item.status !== 'active') continue;
    for (const sku of itemSkus(item)) {
      entry(sku).ml.push(mlListing(item, { economics: economics[item.id], health: health[item.id], catalog: catalog[item.id], nickname: nickname[item.seller_id], questions: questions[item.id] || 0, trends }));
    }
  }
  for (const variant of shopify) {
    const sku = normSku(variant.sku);
    if (!sku || variant.status === 'ARCHIVED') continue;
    entry(sku).shopify.push({
      title: variant.title || '',
      price: Number(variant.price) || 0,
      compareAt: variant.compare_at_price == null ? null : Number(variant.compare_at_price),
      stock: variant.inventory_quantity == null ? null : Number(variant.inventory_quantity),
      active: variant.status === 'ACTIVE',
    });
  }
  return [...bySku.values()].map(finishRow).sort((a, b) => b.units30 - a.units30 || b.visits30 - a.visits30 || a.sku.localeCompare(b.sku));
}

function finishRow(row) {
  row.ml.sort((a, b) => b.units30 - a.units30 || b.sold - a.sold);
  const main = row.ml[0] || null;
  row.name = row.name || main?.title || row.shopify[0]?.title || row.sku;
  row.photo = row.photo || main?.thumbnail || '';
  row.units30 = row.ml.reduce((sum, listing) => sum + listing.units30, 0);
  row.visits30 = row.ml.reduce((sum, listing) => sum + listing.visits30, 0);
  row.questions = row.ml.reduce((sum, listing) => sum + listing.questions, 0);
  row.inQuoter = Boolean(row.productId);
  row.channels = channelsFor(row);
  row.alerts = alertsFor(row);
  // Con ⚠ precio raro la lista no es confiable: no se la toma como «el canal que deja más».
  row.rarePrice = row.alerts.some((alert) => alert.key === 'precio-raro');
  row.best = row.channels.filter((channel) => channel.net != null && !(row.rarePrice && channel.key === 'directo')).sort((a, b) => b.net - a.net)[0] || null;
  row.advice = adviceFor(row);
  return row;
}

// Lo que queda por unidad en cada canal (pesos, con IVA). «Por fuera» = precio de lista del cotizador sin comisión.
export function channelsFor(row) {
  const channels = [];
  if (row.list?.ars != null) channels.push({ key: 'directo', label: 'Por fuera (lista del cotizador)', price: row.list.ars, net: row.list.ars, note: 'sin comisión; el envío se arregla aparte' });
  for (const type of ['gold_special', 'gold_pro']) {
    const listings = row.ml.filter((listing) => listing.type === type);
    if (!listings.length) continue;
    const measured = listings.filter((listing) => listing.net != null).sort((a, b) => b.units30 - a.units30);
    const pick = measured[0] || listings[0];
    channels.push({
      key: `ml-${type}`,
      label: `Mercado Libre ${listingShort(type)}`,
      price: pick.price,
      net: pick.net,
      note: pick.net == null ? 'comisión sin medir (sin ventas en 30 días)' : `comisión ${pick.feePct} %${pick.shipping ? ` + envío $ ${pick.shipping.toLocaleString('es-AR')}` : ''} · ${pick.account}`,
    });
  }
  const shop = row.shopify.find((variant) => variant.active) || null;
  if (shop) channels.push({ key: 'shopify', label: 'Shopify', price: shop.price, net: round(shop.price), note: 'sin comisión de cobro cargada' });
  return channels;
}

export function alertsFor(row) {
  const alerts = [];
  const main = row.ml[0];
  if (row.list?.ars && main?.price) {
    const ratio = main.price / row.list.ars;
    if (ratio > RARE_PRICE.high || ratio < RARE_PRICE.low) {
      alerts.push({ key: 'precio-raro', level: 'alta', text: `⚠ Precio raro: en Mercado Libre se vende a $ ${main.price.toLocaleString('es-AR')} y la lista del cotizador da $ ${row.list.ars.toLocaleString('es-AR')} (${(Math.round(ratio * 10) / 10).toLocaleString('es-AR')} veces). Revisá el precio o si el SKU es de otro tamaño/pack.` });
    }
  }
  for (const listing of row.ml) {
    if (listing.catalog && !listing.catalog.winning && ['competing', 'listed'].includes(listing.catalog.status)) {
      alerts.push({ key: 'catalogo', level: 'media', text: `Perdiendo el catálogo en ${listing.account}${listing.catalog.priceToWin ? `: para ganar, $ ${listing.catalog.priceToWin.toLocaleString('es-AR')}` : ''}${listing.catalog.winner ? ` (gana ${listing.catalog.winner})` : ''}.` });
    }
    if (listing.quality === 'Básica') alerts.push({ key: 'calidad', level: 'media', text: `Calidad Básica en ${listing.account}: completá fotos, ficha y descripción.` });
    if (listing.px === 'red') alerts.push({ key: 'experiencia', level: 'alta', text: `Experiencia de compra en rojo en ${listing.account} (reclamos o cancelaciones).` });
    if (listing.stock === 0 && listing.units30 > 0) alerts.push({ key: 'sin-stock', level: 'alta', text: `Sin stock en ${listing.account} y vendió ${listing.units30} en 30 días.` });
  }
  const shop = row.shopify.find((variant) => variant.active);
  if (shop && main?.price && shop.price > main.price) alerts.push({ key: 'shopify-caro', level: 'media', text: `Shopify ($ ${shop.price.toLocaleString('es-AR')}) está más caro que Mercado Libre ($ ${main.price.toLocaleString('es-AR')}); la regla es ML − 10 %.` });
  if (!row.inQuoter && (row.ml.length || row.shopify.length)) alerts.push({ key: 'no-cotizador', level: 'baja', text: 'Se vende pero no está en el cotizador (falta cargarlo con su precio de lista).' });
  if (row.inQuoter && !row.photo) alerts.push({ key: 'sin-foto', level: 'baja', text: 'Sin foto en el cotizador.' });
  return alerts;
}

export function adviceFor(row) {
  const lines = [];
  const priced = row.channels.filter((channel) => channel.net != null && !(row.rarePrice && channel.key === 'directo')).sort((a, b) => b.net - a.net);
  if (row.rarePrice) lines.push('La lista del cotizador no cierra con Mercado Libre (⚠ precio raro): no se usa para comparar canales hasta corregirla.');
  if (priced.length >= 2) {
    const [first, second] = priced;
    const diff = first.net - second.net;
    lines.push(`Deja más: ${first.label} ($ ${first.net.toLocaleString('es-AR')} por unidad), ${diff > 0 ? `$ ${diff.toLocaleString('es-AR')} más que ${second.label}` : `igual que ${second.label}`}.`);
  } else if (priced.length === 1) {
    lines.push(`Solo hay un canal con dato: ${priced[0].label} deja $ ${priced[0].net.toLocaleString('es-AR')} por unidad.`);
  }
  const classic = row.channels.find((channel) => channel.key === 'ml-gold_special');
  const premium = row.channels.find((channel) => channel.key === 'ml-gold_pro');
  if (classic?.net != null && premium?.net != null) {
    const gap = premium.net - classic.net;
    lines.push(gap >= 0
      ? `En ML, la Premium (cuotas sin interés) deja $ ${gap.toLocaleString('es-AR')} más por unidad que la Clásica: conviene empujar la Premium.`
      : `En ML, la Clásica deja $ ${Math.abs(gap).toLocaleString('es-AR')} más por unidad que la Premium: las cuotas sin interés cuestan más de lo que suben el precio.`);
  }
  const trend = row.ml.find((listing) => listing.trend)?.trend;
  if (trend) lines.push(`En tendencia: «${trend.keyword}» está entre lo más buscado de su categoría.`);
  const rising = row.ml.filter((listing) => listing.rising);
  if (rising.length) lines.push(`Visitas en alza esta semana en ${rising.map((listing) => listing.account).join(', ')}.`);
  return lines;
}

export const HUB_FILTERS = [
  ['todos', 'Todos'],
  ['avisos', 'Con avisos'],
  ['precio-raro', '⚠ Precio raro'],
  ['catalogo', 'Perdiendo catálogo'],
  ['tendencia', 'En tendencia o en alza'],
  ['no-cotizador', 'No están en el cotizador'],
];

export function filterHub(rows, { filter = 'todos', query = '' } = {}) {
  const text = plain(query).trim();
  return rows.filter((row) => {
    if (text && !plain(`${row.sku} ${row.name} ${row.ml.map((listing) => listing.title).join(' ')}`).includes(text)) return false;
    if (filter === 'avisos') return row.alerts.some((alert) => alert.level !== 'baja');
    if (filter === 'tendencia') return row.ml.some((listing) => listing.trend || listing.rising);
    if (filter !== 'todos') return row.alerts.some((alert) => alert.key === filter);
    return true;
  });
}

// Para el asistente: la ficha de los productos que nombra la pregunta (por SKU o por palabras del nombre).
export const asksProductHub = (query) => /\b(conviene|convendria|donde vender|en que canal|cuotas|premium|clasica|un pago|por fuera|tendencia|en alza|precio raro|que producto|sku)\b/.test(plain(query)) || /\b[A-Z0-9]{2,}-[A-Z0-9.\-]+\b/.test(String(query || ''));

export function findInHub(rows, query, { max = 3 } = {}) {
  const raw = String(query || '');
  const skus = (raw.toUpperCase().match(/\b[A-Z0-9]{2,}-[A-Z0-9.\-/]+\b/g) || []).map(normSku);
  const bySku = rows.filter((row) => skus.includes(row.sku));
  if (bySku.length) return bySku.slice(0, max);
  const wanted = words(raw).filter((word) => !['conviene', 'vender', 'mercado', 'libre', 'shopify', 'cuotas', 'premium', 'clasica', 'donde', 'canal', 'precio'].includes(word));
  if (!wanted.length) return [];
  return rows
    .map((row) => ({ row, hits: wanted.filter((word) => plain(`${row.name} ${row.ml[0]?.title || ''}`).includes(word)).length }))
    .filter((entry) => entry.hits >= Math.min(2, wanted.length))
    .sort((a, b) => b.hits - a.hits || b.row.units30 - a.row.units30)
    .slice(0, max)
    .map((entry) => entry.row);
}

export function productHubContext(rows, { title = 'PRODUCTO POR SKU (cotizador + Mercado Libre + Shopify)' } = {}) {
  if (!rows?.length) return '';
  const money = (value) => (value == null ? 'sin dato' : `$\u00a0${Number(value).toLocaleString('es-AR')}`);
  const out = [`${title}; precios finales con IVA; «queda» = precio − comisión real de 30 días − envío:`];
  for (const row of rows) {
    out.push(`- ${row.sku} · ${row.name}${row.list ? ` · lista ${row.list.currency} ${row.list.gross} (${money(row.list.ars)})` : ' · no está en el cotizador'} · vendidas 30 días en ML: ${row.units30}`);
    for (const channel of row.channels) out.push(`  · ${channel.label}: precio ${money(channel.price)}, queda ${money(channel.net)} (${channel.note})`);
    for (const line of row.advice) out.push(`  · ${line}`);
    for (const alert of row.alerts.filter((item) => item.level !== 'baja')) out.push(`  · Aviso: ${alert.text}`);
  }
  return out.join('\n');
}
