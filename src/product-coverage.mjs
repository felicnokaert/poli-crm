// Fichas por producto (Base técnica): qué productos del catálogo (el mismo del cotizador, tabla
// catalog_products) ya tienen ficha técnica y cuáles no. Puro: no lee la base.
// No todos llevan ficha: almohadas, colchones, baldes o pisos no; químicos, siliconas, aerosoles,
// espumas, resinas, poliuretanos y poliureas sí.
import { plain } from './knowledge-search.mjs';

const NO_SHEET_WORDS = ['almohad', 'colchon', 'viscoelast', 'balde', 'piso', 'felpudo', 'alfombra', 'rulo', 'sabana', 'funda', 'acolchad', 'respaldo', 'cojin'];
// Palabras de nombre que no identifican a un producto concreto (no sirven para encontrar su ficha).
const GENERIC = new Set(['espuma', 'kit', 'poliuretano', 'poliurea', 'resina', 'pistola', 'manual', 'para', 'con', 'sin', 'del', 'los', 'las', 'tambor', 'bidon', 'lata', 'aerosol', 'gris', 'blanco', 'negro', 'fria', 'frio', 'penosil', 'resinplast', 'imperpur', 'purmac', 'poliplast', 'grupo']);

export function needsSheet(product = {}) {
  const text = plain([product.family, product.subfamily, product.name].filter(Boolean).join(' '));
  return !NO_SHEET_WORDS.some((word) => text.includes(word));
}

// Lo que identifica al producto: códigos con números (618, 740, PU-46, MS-35) y palabras propias.
export function productKeys(product = {}) {
  const tokens = plain(product.name).split(/[^a-z0-9]+/).filter(Boolean);
  const codes = tokens.filter((token) => /\d/.test(token) && token.length >= 2 && !/^\d+(gr|kg|k|l|ml|cc|m2|m)$/.test(token));
  const words = tokens.filter((token) => !/\d/.test(token) && token.length > 3 && !GENERIC.has(token));
  return { codes, words };
}

const docText = (doc) => plain([doc.title, doc.product, doc.sku, doc.sourceFile || doc.source_file].filter(Boolean).join(' '));

// Fichas de un producto: las vinculadas a mano (product_document_links, por producto o por
// familia+subfamilia) y las que lo nombran (su código, o al menos dos palabras propias).
export function sheetsFor(product = {}, docs = [], links = []) {
  const linked = new Set(links.filter((link) => (link.scope_type === 'product' && link.product_id === product.id)
    || (link.scope_type === 'subfamily' && plain(link.family) === plain(product.family) && plain(link.subfamily) === plain(product.subfamily)))
    .map((link) => link.document_id));
  const { codes, words } = productKeys(product);
  return docs.filter((doc) => {
    if (linked.has(doc.id)) return true;
    const text = ` ${docText(doc).replace(/[^a-z0-9]+/g, ' ')} `;
    if (codes.length) return codes.some((code) => text.includes(` ${code} `) || text.includes(code));
    return words.length >= 2 && words.filter((word) => text.includes(word)).length >= 2;
  });
}

// Resumen por familia: productos con ficha, sin ficha, y los que no la necesitan.
export function coverage(products = [], docs = [], links = []) {
  const families = new Map();
  for (const product of products) {
    const family = product.family || 'Sin familia';
    if (!families.has(family)) families.set(family, { family, withSheet: [], missing: [], notNeeded: [] });
    const entry = families.get(family);
    if (!needsSheet(product)) { entry.notNeeded.push(product); continue; }
    const sheets = sheetsFor(product, docs, links);
    if (sheets.length) entry.withSheet.push({ product, sheets });
    else entry.missing.push(product);
  }
  const list = [...families.values()].sort((a, b) => b.missing.length - a.missing.length || a.family.localeCompare(b.family, 'es-AR'));
  const totals = list.reduce((acc, item) => ({ withSheet: acc.withSheet + item.withSheet.length, missing: acc.missing + item.missing.length, notNeeded: acc.notNeeded + item.notNeeded.length }), { withSheet: 0, missing: 0, notNeeded: 0 });
  return { families: list, totals };
}

// Dónde se guarda la ficha que se sube desde un producto: FICHAS / <familia> / <producto> / archivo.
export function sheetPathFor(product = {}, fileName = '') {
  const clean = (value) => String(value || '').replace(/[\\/]+/g, '-').trim();
  return ['FICHAS', clean(product.family) || 'Sin familia', clean(product.name), fileName].filter(Boolean).join('/');
}
