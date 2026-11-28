// Arreglar publicaciones de Mercado Libre en tanda (28/11, Felipe: «Mercado Libre al 100 % en el Centro de mejoras, menos clips»).
// Solo copia lo que YA tenemos publicado: una publicación sin descripción o con menos de 3 fotos toma la descripción o las
// fotos de OTRA publicación nuestra con el mismo SKU (la que más vendió). No inventa textos. Escribir en ML necesita que la
// app tenga «Publicación y sincronización» en lectura y escritura y que la cuenta esté reconectada; si ML lo niega, se
// corta y se dice por qué. Nada se aplica solo: lo dispara un administrador desde la pantalla.

const API = 'https://api.mercadolibre.com';
const MIN_DESC = 30; // menos que esto = «sin descripción» (igual que el Centro de mejoras)
const GOOD_DESC = 200;
const MIN_PICS = 3;
const MAX_PICS = 10;

// Saca links, mails y teléfonos (ML no los permite) y espacios de más.
export function cleanDescription(text = '') {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/www\.\S+/gi, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/(?:\+?54[\s-]?)?(?:9[\s-]?)?(?:11|[2368]\d{1,3})[\s-]?\d{3,4}[\s-]?\d{4}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 50000);
}

const descLength = (item) => Number(item.description_length ?? String(item.description || '').length) || 0;
const pics = (item) => (Array.isArray(item.picture_urls) ? item.picture_urls.filter((url) => /^https:\/\//.test(url)) : []);
const picCount = (item) => Math.max(Number(item.pictures_count) || 0, pics(item).length);
const hasVariations = (item) => Array.isArray(item.variation_skus) && item.variation_skus.length > 0;
const picKey = (url = '') => (String(url).match(/D_(?:NQ_NP_)?(?:2X_)?(\d+-MLA\d+)/)?.[1] || String(url).split('?')[0]);

// Propuestas: para cada publicación activa con un problema, la «donante» con el mismo SKU (la que más vendió).
export function proposeFixes(items = []) {
  const active = items.filter((item) => item.status === 'active');
  const bySku = new Map();
  for (const item of active) {
    const sku = String(item.sku || '').trim().toUpperCase();
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(item);
  }
  const best = (list, ok) => list.filter(ok).sort((a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0))[0] || null;
  const descriptions = [];
  const photos = [];
  for (const item of active) {
    const sku = String(item.sku || '').trim().toUpperCase();
    const siblings = (bySku.get(sku) || []).filter((other) => other.id !== item.id);
    if (descLength(item) < MIN_DESC) {
      const donor = sku ? best(siblings, (other) => descLength(other) >= GOOD_DESC && cleanDescription(other.description).length >= GOOD_DESC) : null;
      descriptions.push({ id: item.id, seller_id: item.seller_id, title: item.title, sku, sold: Number(item.sold_quantity) || 0,
        donor: donor ? { id: donor.id, seller_id: donor.seller_id, title: donor.title } : null,
        text: donor ? cleanDescription(donor.description) : '' });
    }
    if (picCount(item) < MIN_PICS) {
      const blocked = hasVariations(item) ? 'tiene variantes (las fotos van por variante)' : '';
      const donor = sku && !blocked ? best(siblings, (other) => pics(other).length >= MIN_PICS) : null;
      const current = pics(item);
      const seen = new Set(current.map(picKey));
      const extra = donor ? pics(donor).filter((url) => !seen.has(picKey(url))) : [];
      const add = extra.slice(0, Math.max(0, MAX_PICS - current.length));
      photos.push({ id: item.id, seller_id: item.seller_id, title: item.title, sku, sold: Number(item.sold_quantity) || 0, current: current.length,
        donor: donor && add.length ? { id: donor.id, seller_id: donor.seller_id, title: donor.title } : null, add: donor ? add : [], blocked });
    }
  }
  const order = (a, b) => b.sold - a.sold;
  descriptions.sort(order);
  photos.sort(order);
  return {
    descriptions,
    photos,
    counts: {
      descriptions: descriptions.length,
      descriptionsReady: descriptions.filter((row) => row.donor).length,
      photos: photos.length,
      photosReady: photos.filter((row) => row.donor).length,
    },
  };
}

async function send(http, method, path, token, body) {
  const response = await http(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let json = null;
  try { json = await response.json(); } catch { /* sin cuerpo */ }
  if (!response.ok) {
    const error = new Error(`ML ${response.status}: ${String(json?.message || json?.error || '').slice(0, 160) || 'sin detalle'}`);
    error.status = response.status;
    throw error;
  }
  return json;
}

// Descripción: PUT si ya existe el objeto descripción, POST si no (ML devuelve 404 en el PUT).
export async function writeDescription(itemId, text, token, http) {
  try {
    await send(http, 'PUT', `/items/${itemId}/description?api_version=2`, token, { plain_text: text });
  } catch (error) {
    if (error.status !== 404) throw error;
    await send(http, 'POST', `/items/${itemId}/description`, token, { plain_text: text });
  }
}

// Fotos: se mantienen las actuales (por id, en su orden) y se suman las nuevas al final.
export async function writePictures(itemId, add, token, http) {
  const response = await http(`${API}/items/${itemId}?attributes=pictures,variations`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`ML ${response.status} al leer la publicación`);
  const item = await response.json();
  if (Array.isArray(item.variations) && item.variations.length) throw new Error('tiene variantes: las fotos van por variante, se deja para hacer a mano');
  const keep = (item.pictures || []).map((picture) => ({ id: picture.id }));
  const pictures = [...keep, ...add.map((source) => ({ source }))].slice(0, MAX_PICS);
  const result = await send(http, 'PUT', `/items/${itemId}`, token, { pictures });
  return (result?.pictures || []).map((picture) => picture.secure_url || picture.url).filter(Boolean);
}

const isPermission = (error) => [401, 403].includes(error?.status);

// Aplica una tanda (hasta 10 por pedido). tokenFor(seller_id) da el token de la cuenta dueña.
export async function applyFixes({ kind, ids = [], items = [], tokenFor, http, store, deadline = Date.now() + 45000 }) {
  const plan = proposeFixes(items);
  const list = (kind === 'photos' ? plan.photos : plan.descriptions).filter((row) => row.donor && ids.includes(row.id)).slice(0, 10);
  const done = [];
  const failed = [];
  for (const row of list) {
    if (Date.now() > deadline) { failed.push({ id: row.id, error: 'sin tiempo: tocá de nuevo para seguir' }); continue; }
    try {
      const token = await tokenFor(row.seller_id);
      if (kind === 'photos') {
        const urls = await writePictures(row.id, row.add, token, http);
        await store.patch('ml_items', `id=eq.${row.id}`, { pictures_count: urls.length || row.current + row.add.length, ...(urls.length ? { picture_urls: urls } : {}) });
      } else {
        await writeDescription(row.id, row.text, token, http);
        await store.patch('ml_items', `id=eq.${row.id}`, { description: row.text, description_length: row.text.length });
      }
      done.push(row.id);
    } catch (error) {
      failed.push({ id: row.id, error: String(error?.message || error).slice(0, 200) });
      // Sin permiso de escritura no tiene sentido seguir con las demás.
      if (isPermission(error)) return { done, failed, denied: true };
    }
  }
  return { done, failed, denied: false };
}
