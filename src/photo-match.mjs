// Carga masiva de fotos del catálogo (23/10): empareja cada archivo de una carpeta con un producto del catálogo.
// 1) Por SKU: el nombre del archivo (sin extensión) es el SKU de una variante ("PM490.jpg", "KT-740-1.png"); se compara
//    solo con letras y números, así "3M-6200_07025-1" y "3M-6200/07025-1" son lo mismo. Si no coincide se prueban los
//    sufijos típicos ("PM490_foto", "PM490 (1)", "PM490-frente").
// 2) Por nombre: las palabras del archivo contra las del producto, solo si hay un único candidato claro.
// Todo lo que no es exacto queda para confirmar a mano. Puro: no lee la base.

export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

const alnum = (value = '') => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (value = '') => [...new Set(String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word.length >= 3 || /[0-9]/.test(word)))];

export function fileBase(name = '') {
  return String(name).split(/[\\/]/).pop().replace(IMAGE_EXT, '');
}

const SUFFIXES = [/\s*\(\d+\)$/, /[\s_-]+(?:FOTO|IMG|IMAGEN|FRENTE|LADO|COPIA|WEB|HD|MAIN|PRINCIPAL|\d{1,2})$/i];

export function skuKeys(name) {
  const keys = [];
  let current = fileBase(name).trim();
  for (let step = 0; step < 3 && current; step += 1) {
    const key = alnum(current);
    if (key && !keys.includes(key)) keys.push(key);
    const next = SUFFIXES.reduce((acc, pattern) => (acc === current ? acc.replace(pattern, '') : acc), current);
    if (next === current) break;
    current = next.trim();
  }
  return keys;
}

export function photoState(product, photoRow) {
  if (String(product?.photo_path || '').trim()) return 'propia';
  if (!photoRow) return null;
  return String(photoRow.approved_by || '').toLowerCase().startsWith('claude') ? 'sin-revisar' : 'aprobada';
}

export function matchPhotos(files = [], { products = [], variants = [], photos = [] } = {}) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const photoByProduct = new Map(photos.map((photo) => [photo.product_id, photo]));
  const variantByKey = new Map();
  for (const variant of variants) {
    const key = alnum(variant.sku);
    if (key && !variantByKey.has(key) && productById.has(variant.product_id)) variantByKey.set(key, variant);
  }
  const productTokens = products.map((product) => ({ product, tokens: words(product.name) }));
  const used = new Map();
  return files.map((file) => {
    const name = file.name;
    let product = null, sku = '', status = 'sin', via = '', candidates = [];
    for (const key of skuKeys(name)) {
      const variant = variantByKey.get(key);
      if (variant) { product = productById.get(variant.product_id); sku = variant.sku; status = 'exacto'; via = 'SKU'; break; }
    }
    if (!product) {
      const fileTokens = words(fileBase(name));
      if (fileTokens.length >= 2) {
        const scored = productTokens.map(({ product: candidate, tokens }) => {
          const shared = fileTokens.filter((token) => tokens.includes(token)).length;
          const union = new Set([...fileTokens, ...tokens]).size;
          return { candidate, shared, score: union ? shared / union : 0 };
        }).filter((item) => item.shared >= 2 && item.score >= 0.75).sort((a, b) => b.score - a.score);
        if (scored.length) {
          candidates = scored.slice(0, 5).map((item) => item.candidate);
          const top = scored[0];
          if (scored.length === 1 || top.score > scored[1].score) { product = top.candidate; status = 'probable'; via = 'nombre'; }
          else status = 'ambiguo';
        }
      }
    }
    const row = { name, file, status, via, sku, product, candidates, state: product ? photoState(product, photoByProduct.get(product.id)) : null, duplicateOf: '' };
    if (product) {
      if (used.has(product.id)) { row.duplicateOf = used.get(product.id); row.status = 'repetida'; }
      else used.set(product.id, name);
    }
    return row;
  });
}

// ¿Se sube por defecto? Lo exacto o probable que todavía no tiene foto firme; lo que ya tiene foto propia o aprobada
// por una persona queda sin marcar (se puede marcar para reemplazar).
export const selectedByDefault = (row) => Boolean(row.product) && ['exacto', 'probable'].includes(row.status) && ['sin-revisar', null].includes(row.state);

export const summarize = (rows) => ({
  total: rows.length,
  exacto: rows.filter((row) => row.status === 'exacto').length,
  probable: rows.filter((row) => row.status === 'probable').length,
  ambiguo: rows.filter((row) => row.status === 'ambiguo').length,
  sin: rows.filter((row) => row.status === 'sin').length,
  repetida: rows.filter((row) => row.status === 'repetida').length,
});

const plain = (value = '') => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "Una foto para varios productos": productos cuyo nombre tiene TODAS las palabras escritas (sin acentos ni mayúsculas,
// en cualquier orden), opcionalmente de una familia/subfamilia. Sirve para poner la misma foto a todos los polioles,
// todas las almohadas no cervicales, etc. `exclude` (palabras separadas por coma) saca lo que no va.
export function filterProductsByText(products = [], { text = '', family = '', subfamily = '', exclude = '' } = {}) {
  const must = plain(text).split(/\s+/).filter(Boolean);
  const not = plain(exclude).split(/[,;]+/).map((word) => word.trim()).filter(Boolean);
  if (!must.length && !family && !subfamily) return [];
  return products.filter((product) => {
    const name = plain(product.name);
    return must.every((word) => name.includes(word))
      && not.every((word) => !name.includes(word))
      && (!family || product.family === family)
      && (!subfamily || product.subfamily === subfamily);
  });
}
