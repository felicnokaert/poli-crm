// Productos que se venden en Mercado Libre y NO están en Shopify (24/10, Felipe: "para poder implementarlos"). Se cruza por SKU con
// las publicaciones activas de ML; de cada uno sale una propuesta lista para revisar: precio (ML − 10 %), título corto, descripción
// limpia, SEO, etiquetas, metacampos (de los atributos de ML) y con qué otros se agruparía como variantes. Solo PROPONE: el CSV se
// importa en Shopify como BORRADOR (Productos → Importar); el CRM no escribe nada en la tienda.
import { plain } from './knowledge-search.mjs';
import { parseTitle } from './shopify-grouping.mjs';
import { DISCOUNT } from './shopify-prices.mjs';

const key = (sku) => String(sku || '').trim().toUpperCase();
const squash = (sku) => key(sku).replace(/[^A-Z0-9]/g, '');
const STOP = new Set(['de', 'para', 'con', 'sin', 'el', 'la', 'los', 'las', 'y', 'en', 'por', 'un', 'una', 'x']);
const tokens = (text) => new Set(plain(text).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)));

export function similarity(a, b) {
  const left = tokens(a); const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common += 1;
  return common / Math.min(left.size, right.size);
}

// Familia del SKU: todo menos el último tramo (RE-608-750 → RE-608).
export function skuStem(sku) {
  const parts = key(sku).split('-').filter(Boolean);
  return parts.length >= 3 ? parts.slice(0, -1).join('-') : parts.length === 2 ? parts[0] : '';
}

export function cleanDescription(text = '') {
  return String(text || '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, ' ')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function shortTitle(title = '', max = 70) {
  const clean = String(title).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : max).trim();
}

const SKIP_ATTRS = /gtin|ean|upc|motivo|sku|c[oó]digo|item condition|condici[oó]n/i;
export function metafieldsFrom(attributes) {
  const list = Array.isArray(attributes) ? attributes : [];
  return list
    .filter((attr) => attr?.name && attr?.value && !SKIP_ATTRS.test(attr.name) && String(attr.value).length <= 120)
    .slice(0, 8)
    .map((attr) => ({ name: attr.name, key: plain(attr.name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), value: String(attr.value) }));
}

const brandOf = (attributes) => (Array.isArray(attributes) ? attributes.find((attr) => plain(attr?.name) === 'marca')?.value : '') || '';
const firstSentences = (text, max) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return (stop > 60 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : max)).trim();
};

// Una publicación de ML por SKU: la activa que más vendió (suma ventas y visitas de todas las cuentas).
function perSku(mlItems) {
  const map = new Map();
  for (const item of mlItems) {
    if (item.status !== 'active') continue;
    const sku = key(item.sku);
    if (!sku) continue;
    if (!map.has(sku)) map.set(sku, []);
    map.get(sku).push(item);
  }
  return [...map].map(([sku, list]) => {
    const ref = [...list].sort((a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0))[0];
    return {
      sku, item: ref, listings: list.length,
      sold: list.reduce((sum, item) => sum + (Number(item.sold_quantity) || 0), 0),
      visits: list.reduce((sum, item) => sum + (Number(item.visits_30d) || 0), 0),
    };
  });
}

export function missingFromShopify({ products = [], variants = [], mlItems = [], discount = DISCOUNT } = {}) {
  const live = new Map(products.filter((product) => product.status !== 'ARCHIVED').map((product) => [product.id, product]));
  const shopifySkus = new Set(); const squashed = new Map(); const stems = new Map();
  for (const variant of variants) {
    const product = live.get(variant.product_id);
    if (!product || !variant.sku) continue;
    shopifySkus.add(key(variant.sku));
    squashed.set(squash(variant.sku), product);
    const stem = skuStem(variant.sku);
    if (stem && !stems.has(stem)) stems.set(stem, product);
  }
  const catalog = [...live.values()];
  const missing = perSku(mlItems).filter((entry) => !shopifySkus.has(entry.sku)).map((entry) => {
    const { item } = entry;
    const price = Number(item.price) || 0;
    const description = cleanDescription(item.description);
    const title = shortTitle(item.title);
    const brand = brandOf(item.attributes);
    const twin = squashed.get(squash(entry.sku)) || null;
    let lookalike = null; let best = 0;
    for (const product of catalog) { const score = similarity(item.title, product.title); if (score > best) { best = score; lookalike = product; } }
    const stem = skuStem(entry.sku);
    const warnings = [];
    if (twin) warnings.push(`SKU casi igual a uno de Shopify (${twin.title}): puede ser el mismo producto con otro formato de SKU.`);
    else if (lookalike && best >= 0.7 && !(stem && stems.has(stem))) warnings.push(`Título muy parecido a «${lookalike.title}»: revisá que no esté ya cargado con otro SKU.`);
    if (!description) warnings.push('La publicación de ML no tiene descripción: escribirla antes de publicar.');
    if ((Number(item.pictures_count) || 0) < 3) warnings.push('Menos de 3 fotos en ML.');
    if (!(Number(item.available_quantity) > 0)) warnings.push('Sin stock en ML.');
    const seoSource = description || title;
    return {
      sku: entry.sku, mlId: item.id, permalink: item.permalink || '', mlTitle: item.title || '', title, mlPrice: price,
      price: price > 0 ? Math.round(price * (1 - discount)) : 0, sold: entry.sold, visits: entry.visits, listings: entry.listings,
      stock: Number(item.available_quantity) || 0, pictures: Number(item.pictures_count) || 0, image: item.picture_url || item.thumbnail || '',
      description, seoTitle: shortTitle(`${title} | Poliplast`, 60), seoDescription: firstSentences(seoSource, 155),
      brand, tags: [...new Set([brand, 'mercado-libre'].filter(Boolean))], metafields: metafieldsFrom(item.attributes),
      stem, attrs: parseTitle(item.title).attrs, joinsProduct: stem ? stems.get(stem) || null : null, twin, lookalike: best >= 0.7 && !(stem && stems.has(stem)) ? lookalike : null, warnings,
    };
  });
  // Agrupar los que faltan por familia de SKU (si los títulos se parecen) para proponerlos como UN producto con variantes.
  const byStem = new Map();
  for (const row of missing) {
    if (!row.stem || row.joinsProduct) continue;
    if (!byStem.has(row.stem)) byStem.set(row.stem, []);
    byStem.get(row.stem).push(row);
  }
  for (const rows of byStem.values()) {
    const seed = [...rows].sort((a, b) => b.sold - a.sold)[0];
    const kin = rows.filter((row) => row === seed || similarity(row.mlTitle, seed.mlTitle) >= 0.4);
    if (kin.length < 2) continue;
    const names = [...new Set(kin.flatMap((row) => Object.keys(row.attrs)))];
    const varying = names.filter((name) => new Set(kin.map((row) => row.attrs[name] ?? '—')).size > 1).slice(0, 3);
    const options = varying.length ? varying : ['Modelo'];
    const groupId = seed.stem;
    for (const row of kin) {
      row.group = { id: groupId, size: kin.length, options, values: options.map((name) => (name === 'Modelo' ? row.sku.split('-').pop() : row.attrs[name] ?? '—')) };
    }
  }
  const sorted = missing.sort((a, b) => b.sold - a.sold || b.visits - a.visits || a.sku.localeCompare(b.sku));
  const noSku = mlItems.filter((item) => item.status === 'active' && !key(item.sku)).map((item) => {
    let match = null; let best = 0;
    for (const product of catalog) { const score = similarity(item.title, product.title); if (score > best) { best = score; match = product; } }
    return { mlId: item.id, title: item.title, price: Number(item.price) || 0, sold: Number(item.sold_quantity) || 0, permalink: item.permalink || '', maybe: best >= 0.7 ? match : null };
  }).sort((a, b) => b.sold - a.sold);
  const groups = new Set(sorted.filter((row) => row.group).map((row) => row.group.id));
  return {
    rows: sorted, noSku,
    summary: {
      missing: sorted.length, withSales: sorted.filter((row) => row.sold > 0).length, soldMissing: sorted.reduce((sum, row) => sum + row.sold, 0),
      groups: groups.size, joinExisting: sorted.filter((row) => row.joinsProduct).length, doubtful: sorted.filter((row) => row.twin || row.lookalike).length, noSku: noSku.length,
    },
  };
}

export function filterMissing(rows = [], { query = '', view = '' } = {}) {
  const text = plain(query);
  return rows.filter((row) => {
    if (text && !plain(`${row.sku} ${row.mlTitle}`).includes(text)) return false;
    if (view === 'ventas') return row.sold > 0;
    if (view === 'grupos') return Boolean(row.group);
    if (view === 'sumar') return Boolean(row.joinsProduct);
    if (view === 'dudosos') return Boolean(row.twin || row.lookalike);
    return true;
  });
}

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const handleOf = (text) => plain(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const html = (text) => text.split(/\n{2,}/).map((part) => `<p>${part.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])).replace(/\n/g, '<br>')}</p>`).join('');

// CSV con el formato de importación de productos de Shopify, siempre como BORRADOR. Solo los que no se suman a un producto existente
// ni parecen duplicados; los agrupados salen como un producto con sus variantes.
export function shopifyImportCsv(rows = []) {
  const head = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'SEO Title', 'SEO Description', 'Status'];
  const importable = rows.filter((row) => !row.joinsProduct && !row.twin && row.price > 0);
  const products = new Map();
  for (const row of importable) {
    const id = row.group ? `g:${row.group.id}` : `s:${row.sku}`;
    if (!products.has(id)) products.set(id, []);
    products.get(id).push(row);
  }
  const lines = [];
  for (const list of products.values()) {
    const lead = [...list].sort((a, b) => b.sold - a.sold)[0];
    const grouped = list.length > 1 && lead.group;
    const handle = handleOf(grouped ? shortTitle(lead.mlTitle, 50) : lead.title) || handleOf(lead.sku);
    list.forEach((row, index) => {
      const opts = grouped ? lead.group.options : ['Title'];
      const vals = grouped ? row.group.values : ['Default Title'];
      const optCells = [0, 1, 2].flatMap((n) => (opts[n] ? [opts[n], vals[n]] : ['', '']));
      const first = index === 0;
      lines.push([
        handle, first ? lead.title : '', first ? html(lead.description) : '', first ? 'Poliplast' : '', '', first ? lead.tags.join(', ') : '', first ? 'FALSE' : '',
        ...optCells, row.sku, 'shopify', row.stock > 0 ? 999 : 0, 'deny', 'manual', row.price, 'TRUE', 'TRUE', first ? lead.image : '', first ? lead.seoTitle : '', first ? lead.seoDescription : '', first ? 'draft' : '',
      ].map(cell).join(','));
    });
  }
  return `﻿${[head.map(cell).join(','), ...lines].join('\n')}`;
}

// Hoja de trabajo (para revisar en planilla): todo lo sugerido, una fila por SKU.
export function missingReviewCsv(rows = []) {
  const head = ['SKU', 'Título de ML', 'Título sugerido', 'Precio ML', 'Precio Shopify sugerido', 'Vendidas (ML)', 'Visitas 30 días', 'Stock ML', 'Fotos', 'Se agrupa con', 'Opciones', 'Se suma al producto', 'Etiquetas', 'SEO título', 'SEO descripción', 'Metacampos', 'Avisos', 'Link ML'];
  const lines = rows.map((row) => [
    row.sku, row.mlTitle, row.title, row.mlPrice, row.price, row.sold, row.visits, row.stock, row.pictures,
    row.group ? `${row.group.id} (${row.group.size})` : '', row.group ? row.group.options.map((name, i) => `${name}: ${row.group.values[i]}`).join(' / ') : '',
    row.joinsProduct?.title || '', row.tags.join(', '), row.seoTitle, row.seoDescription, row.metafields.map((field) => `${field.name}: ${field.value}`).join(' | '), row.warnings.join(' | '), row.permalink,
  ].map(cell).join(','));
  return `﻿${[head.map(cell).join(','), ...lines].join('\n')}`;
}
