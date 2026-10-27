// Productos que se venden en Mercado Libre y NO están en Shopify (24/10, Felipe: "para poder implementarlos"). Se cruza por SKU con
// las publicaciones activas de ML; de cada uno sale una propuesta lista para revisar: precio (ML − 10 %), título corto, descripción
// limpia, SEO, etiquetas, metacampos (de los atributos de ML) y con qué otros se agruparía como variantes. Solo PROPONE: el CSV se
// importa en Shopify como BORRADOR (Productos → Importar); el CRM no escribe nada en la tienda.
import { plain } from './knowledge-search.mjs';
import { parseTitle, COLORS } from './shopify-grouping.mjs';
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

// ¿Terminan en lo mismo? Solo cuenta como "mismo producto" si el último tramo es equivalente: igual (ignorando signos y ceros)
// o el mismo número en kg y en g (0.750 = 750). -1 y -3 (packs) o -12 y -1 NO son equivalentes.
export function skuSuffixEquivalent(a, b) {
  const last = (sku) => key(sku).split('-').pop() || '';
  const x = last(a); const y = last(b);
  if (!x || !y) return false;
  const num = (v) => (/^\d+(?:\.\d+)?$/.test(v) ? Number(v) : null);
  const nx = num(x); const ny = num(y);
  if (nx !== null && ny !== null) return nx === ny || Math.abs(nx * 1000 - ny) < 1e-9 || Math.abs(ny * 1000 - nx) < 1e-9;
  return x.replace(/[^A-Z0-9]/g, '').replace(/^0+/, '') === y.replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}

// 27/10 (Felipe: «me recomendás publicar productos que ya están»): el mismo producto cargado con un SKU parecido (PS-EMPU46M-1 y
// PS-EMPU46MSP-1, PS-PU47P-1 y PS-PU47-1, PS-EPP995-1 y PS-EEP995-1) o un kit con otro formato (PS-PP750-3+PS-PPC1-1+PS-L47-1 y KT-PS-PP750-3).
// Misma terminación equivalente + el resto casi igual (una letra de diferencia, una es prefijo de la otra o letras cambiadas de lugar).
const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep; }
  }
  return row[b.length];
};
export function skuNear(a, b) {
  const x = key(a); const y = key(b);
  if (!x || !y || x === y || !skuSuffixEquivalent(x, y)) return false;
  const head = (sku) => sku.split('-').slice(0, -1).join('').replace(/[^A-Z0-9]/g, '');
  const hx = head(x); const hy = head(y);
  if (hx.length < 5 || hy.length < 5) return false;
  if (hx === hy) return true;
  const [short, long] = hx.length <= hy.length ? [hx, hy] : [hy, hx];
  if (long.startsWith(short) && long.length - short.length <= 3) return true;
  const distance = editDistance(hx, hy);
  return Math.abs(hx.length - hy.length) <= 1 && (distance <= 1 || (distance <= 2 && [...hx].sort().join('') === [...hy].sort().join('')));
}
// Un SKU compuesto «A-3+B-1+C-1» es el kit de A: en la tienda suele figurar como «KT-A-3».
export const kitOf = (sku) => { const first = key(sku).split('+')[0]; return key(sku).includes('+') ? first : ''; };

// Familia del SKU: todo menos el último tramo (RE-608-750 → RE-608).
export function skuStem(sku) {
  const parts = key(sku).split('-').filter(Boolean);
  return parts.length >= 3 ? parts.slice(0, -1).join('-') : parts.length === 2 ? parts[0] : '';
}

export function cleanDescription(text = '') {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
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

const SKIP_ATTRS = /gtin|ean|upc|motivo|sku|c[oó]digo|item condition|condici[oó]n|impuesto/i;
export function metafieldsFrom(attributes) {
  const list = Array.isArray(attributes) ? attributes : [];
  return list
    .filter((attr) => attr?.name && attr?.value && !SKIP_ATTRS.test(attr.name) && String(attr.value).length <= 120)
    .slice(0, 8)
    .map((attr) => ({ name: attr.name, key: plain(attr.name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), value: String(attr.value) }));
}

// 27/10 (Felipe): KT-618 y KT-619 son el MISMO producto (Poliplus SP, poliol + isocianato proyectado): el número final del SKU son los
// kilos del kit (KT-619-45 = 45 kg). Van juntos como UN producto con la opción «Presentación» en kg, aunque los títulos de ML sean distintos.
export const KG_FAMILIES = [
  { stems: ['KT-618', 'KT-619'], id: 'KT-618/619', title: 'POLIPLUS 618 SP - Espuma de poliuretano proyectada (kit poliol + isocianato)' },
];
const kgFamilyOf = (stem) => KG_FAMILIES.find((family) => family.stems.includes(stem)) || null;
const kgLabel = (sku) => { const n = key(sku).split('-').pop(); return /^\d+(?:\.\d+)?$/.test(n) ? `${Number(n)} kg` : null; };

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
  const shopifySkus = new Set(); const squashed = new Map(); const stems = new Map(); const stemSkus = new Map();
  for (const variant of variants) {
    const product = live.get(variant.product_id);
    if (!product || !variant.sku) continue;
    shopifySkus.add(key(variant.sku));
    squashed.set(squash(variant.sku), product);
    const stem = skuStem(variant.sku);
    if (stem && !stems.has(stem)) stems.set(stem, product);
    if (stem) { if (!stemSkus.has(stem)) stemSkus.set(stem, []); stemSkus.get(stem).push([key(variant.sku), product]); }
  }
  const catalog = [...live.values()];
  const allShopify = variants.filter((variant) => variant.sku && live.has(variant.product_id)).map((variant) => [key(variant.sku), live.get(variant.product_id)]);
  const missing = perSku(mlItems).filter((entry) => !shopifySkus.has(entry.sku)).map((entry) => {
    const { item } = entry;
    const price = Number(item.price) || 0;
    const description = cleanDescription(item.description);
    const title = shortTitle(item.title);
    const brand = brandOf(item.attributes);
    // Mismo producto con otro formato de SKU (0.750 = 750): ya está en la tienda.
    const sameStem = skuStem(entry.sku);
    const kit = kitOf(entry.sku);
    const twin = squashed.get(squash(entry.sku)) || ((stemSkus.get(sameStem) || []).find(([sku]) => skuSuffixEquivalent(sku, entry.sku)) || [])[1]
      || (kit ? squashed.get(squash(`KT-${kit}`)) || null : null)
      || (allShopify.find(([sku]) => skuNear(sku, entry.sku)) || [])[1] || null;
    let lookalike = null; let best = 0;
    for (const product of catalog) { const score = similarity(item.title, product.title); if (score > best) { best = score; lookalike = product; } }
    const stem = skuStem(entry.sku);
    // Parecido más flojo (50 a 70 %): no frena la creación, pero se muestra para que Felipe decida (ej. Lámina PRFV vs Placa PRFV).
    const hint = best >= 0.5 && best < 0.7 && !(stem && stems.has(stem)) ? lookalike : null;
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
      description, seoTitle: `${shortTitle(title, 48)} | Poliplast`, seoDescription: firstSentences(seoSource, 155),
      brand, tags: [...new Set([brand, 'crm-borrador'].filter(Boolean))], metafields: metafieldsFrom(item.attributes),
      stem, attrs: parseTitle(item.title).attrs, joinsProduct: stem ? stems.get(stem) || null : null, twin, hint, lookalike: best >= 0.7 && !(stem && stems.has(stem)) ? lookalike : null, warnings,
    };
  });
  // Agrupar los que faltan por familia de SKU (si los títulos se parecen) para proponerlos como UN producto con variantes.
  const byStem = new Map();
  for (const row of missing) {
    if (!row.stem || row.joinsProduct) continue;
    if (!byStem.has(row.stem)) byStem.set(row.stem, []);
    byStem.get(row.stem).push(row);
  }
  // Familias por kilos: se juntan todas las filas de las dos raíces, sin mirar el parecido de títulos.
  const kgGroups = new Map();
  for (const [stem, rows] of [...byStem]) {
    const family = kgFamilyOf(stem);
    if (!family) continue;
    byStem.delete(stem);
    kgGroups.set(family.id, { family, rows: [...(kgGroups.get(family.id)?.rows || []), ...rows] });
  }
  for (const { family, rows } of kgGroups.values()) {
    const ok = rows.filter((row) => kgLabel(row.sku));
    for (const row of rows) if (!ok.includes(row)) row.warnings.push('El SKU no termina en kilos: se crea aparte.');
    const taken = new Map();
    const members = [];
    for (const row of [...ok].sort((a, b) => b.sold - a.sold)) {
      const label = kgLabel(row.sku);
      if (taken.has(label)) { row.dupOf = taken.get(label); row.warnings.push(`Mismo producto que ${row.dupOf} (${label}) con otro SKU: se crea solo uno. Unificá el SKU en Mercado Libre.`); continue; }
      taken.set(label, row.sku); members.push(row);
    }
    if (members.length < 2) continue;
    members.sort((a, b) => parseFloat(kgLabel(a.sku)) - parseFloat(kgLabel(b.sku)));
    const labels = [...taken.keys()].sort((a, b) => parseFloat(a) - parseFloat(b));
    const note = `Se ofrece en distintos formatos: el número final del código indica los kilos del kit (${labels.join(', ')}).`;
    for (const row of members) row.group = { id: family.id, size: members.length, options: ['Presentación'], values: [kgLabel(row.sku)], title: family.title, note };
  }
  for (const rows of byStem.values()) {
    const seed = [...rows].sort((a, b) => b.sold - a.sold)[0];
    const kin = rows.filter((row) => row === seed || similarity(row.mlTitle, seed.mlTitle) >= 0.4);
    if (kin.length < 2) continue;
    // Valor de cada opción según el título (sin pack = x1). Si el título no lo dice, queda vacío y esa fila no entra al grupo.
    const valueOf = (row, name) => (name === 'Presentación' ? row.sku.split('-').pop() : row.attrs[name] ?? (name === 'Pack' ? 'x1' : null));
    const names = [...new Set(kin.flatMap((row) => Object.keys(row.attrs)))];
    const varying = names.filter((name) => new Set(kin.map((row) => valueOf(row, name) ?? '—')).size > 1).slice(0, 3);
    const options = varying.length ? varying : ['Presentación'];
    // Todas las filas del grupo tienen que tener valor en todas las opciones; las que no, se crean aparte (no se inventan variantes).
    const loose = new Set();
    for (const row of kin) {
      if (options.some((name) => valueOf(row, name) === null)) { loose.add(row); row.warnings.push(`No se agrupó con ${seed.sku}: el título no dice ${options.filter((name) => valueOf(row, name) === null).join(' ni ')}. Se crea aparte.`); }
    }
    // Dos SKU para el mismo producto y tamaño (RE-608-0.750 y RE-608-750): se crea uno solo (el que más vendió) y se avisa.
    // Si dos filas quedan con los mismos valores pero sus SKU NO son equivalentes (el título no distingue el tamaño), la segunda
    // se crea aparte y se avisa.
    const taken = new Map();
    for (const row of [...kin].filter((item) => !loose.has(item)).sort((a, b) => b.sold - a.sold)) {
      const id = options.map((name) => valueOf(row, name)).join('|');
      if (!taken.has(id)) { taken.set(id, row.sku); continue; }
      const first = taken.get(id);
      if (skuSuffixEquivalent(first, row.sku)) { row.dupOf = first; row.warnings.push(`Mismo producto que ${first} con otro SKU: se crea solo uno. Unificá el SKU en Mercado Libre.`); } else { loose.add(row); row.warnings.push(`El título no distingue este producto de ${first} (SKU distinto): se crea aparte. Revisá si es otro tamaño o pack.`); }
    }
    const members = kin.filter((item) => !loose.has(item));
    if (members.length < 2) continue;
    for (const row of members) row.group = { id: seed.stem, size: members.length, options, values: options.map((name) => valueOf(row, name)) };
  }
  // Los que quedaron sueltos pero son el MISMO producto con otro color / tamaño / pack (ej. Pintura náutica blanca, azul y celeste con SKU
  // sin relación): se juntan por el nombre del título.
  const loose = missing.filter((row) => !row.group && !row.joinsProduct && !row.twin && !row.lookalike && !row.dupOf);
  const byBase = new Map();
  for (const row of loose) {
    const { base, attrs } = parseTitle(row.mlTitle);
    if (base.length < 12) continue;
    row.titleAttrs = attrs;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(row);
  }
  for (const [base, rows] of byBase) {
    if (rows.length < 2) continue;
    const names = [...new Set(rows.flatMap((row) => Object.keys(row.titleAttrs)))];
    const varying = names.filter((name) => new Set(rows.map((row) => row.titleAttrs[name] ?? (name === 'Pack' ? 'x1' : '—'))).size > 1).slice(0, 3);
    if (!varying.length) continue;
    const valueOf = (row, name) => row.titleAttrs[name] ?? (name === 'Pack' ? 'x1' : null);
    const members = []; const seen = new Set();
    for (const row of [...rows].sort((a, b) => b.sold - a.sold)) {
      if (varying.some((name) => valueOf(row, name) === null)) continue;
      const id = varying.map((name) => valueOf(row, name)).join('|');
      if (seen.has(id)) continue;
      seen.add(id); members.push(row);
    }
    if (members.length < 2) continue;
    const lead = members[0];
    const title = shortTitle(String(lead.mlTitle).split(/\s+/).filter((word) => !COLORS.includes(plain(word))).join(' ').replace(/\b\d+(?:[.,]\d+)?\s?(?:kg|gr|g|lts|lt|l|ml|cc|m2|mts|mt|m|cm|mm)\b/gi, ' ').replace(/\bx\s?\d+\b/gi, ' ').replace(/\s+/g, ' ').trim(), 70);
    for (const row of members) { row.group = { id: `t:${base}`, size: members.length, options: varying, values: varying.map((name) => valueOf(row, name)), title }; row.warnings.push('Se agrupa por el nombre del título (los SKU no tienen relación): revisá que sean el mismo producto.'); }
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
      groups: groups.size, joinExisting: sorted.filter((row) => row.joinsProduct && !(row.twin || row.lookalike)).length, doubtful: sorted.filter((row) => row.twin || row.lookalike).length, noSku: noSku.length,
    },
  };
}

// Decisiones guardadas ({ SKU: { state, note, by, at } }): lo decidido sale de la lista normal y queda en "Decididos".
export const DECISION_LABEL = { existe: 'Ya existe en la tienda', no_subir: 'No lo vamos a subir', despues: 'Más tarde' };
export function filterMissing(rows = [], { query = '', view = '', decisions = {} } = {}) {
  const text = plain(query);
  return rows.filter((row) => {
    const decided = Boolean(decisions[row.sku]);
    if (view === 'decididos') return decided;
    if (decided) return false;
    if (text && !plain(`${row.sku} ${row.mlTitle}`).includes(text)) return false;
    if (view === 'ventas') return row.sold > 0;
    if (view === 'grupos') return Boolean(row.group);
    if (view === 'sumar') return Boolean(row.joinsProduct) && !(row.twin || row.lookalike);
    if (view === 'dudosos') return Boolean(row.twin || row.lookalike);
    return true;
  });
}

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const handleOf = (text) => plain(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
export const descriptionHtml = (text) => text.split(/\n{2,}/).map((part) => `<p>${part.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])).replace(/\n/g, '<br>')}</p>`).join('');

// Título de un producto con variantes: el de la publicación más vendida sin los tamaños ni el pack (eso pasa a ser la opción).
export const groupTitle = (lead) => lead.group?.title || shortTitle(String(lead.mlTitle).replace(/\b\d+(?:[.,]\d+)?\s?(?:kg|gr|g|lts|lt|l|ml|cc|m2|mts|mt|m|cm|mm)\b/gi, ' ').replace(/\bx\s?\d+\b/gi, ' ').replace(/\s+/g, ' ').trim(), 70);

// Lo que se puede crear: sin los que se suman a un producto existente ni los que parecen duplicados. Los de una misma familia
// van juntos como un producto con variantes. Lo usan el CSV y la creación de borradores.
export function draftGroups(rows = []) {
  const importable = rows.filter((row) => !row.joinsProduct && !row.twin && !row.lookalike && !row.dupOf && row.price > 0);
  const products = new Map();
  for (const row of importable) {
    const id = row.group ? `g:${row.group.id}` : `s:${row.sku}`;
    if (!products.has(id)) products.set(id, []);
    products.get(id).push(row);
  }
  return [...products.values()].map((list) => {
    const lead = [...list].sort((a, b) => b.sold - a.sold)[0];
    if (lead.group?.note) list.sort((a, b) => parseFloat(a.group.values[0]) - parseFloat(b.group.values[0]));
    return { list, lead, grouped: Boolean(list.length > 1 && lead.group) };
  });
}

// Descripción de un producto: la de la publicación que más vendió y, en grupos por kilos, la aclaración de los formatos.
const draftSeoTitle = (lead, grouped) => (grouped && lead.group?.title ? `${shortTitle(lead.group.title, 48)} | Poliplast` : lead.seoTitle);
const draftDescription = (lead, grouped) => (grouped && lead.group?.note ? `${lead.description}\n\n${lead.group.note}`.trim() : lead.description);

// Pedido para crear cada grupo como borrador en Shopify (ver lib/shopify-write.mjs).
export function draftSpecs(rows = []) {
  return draftGroups(rows).map(({ list, lead, grouped }) => ({
    title: grouped ? groupTitle(lead) : lead.title,
    descriptionHtml: descriptionHtml(draftDescription(lead, grouped)), tags: lead.tags, seoTitle: draftSeoTitle(lead, grouped), seoDescription: lead.seoDescription,
    images: lead.image ? [lead.image] : [],
    // En un producto con variantes, lo que cambia entre variantes (color, peso…) no va como metacampo del producto.
    metafields: lead.metafields.filter((field) => !grouped || !(field.key.startsWith('color') || ['peso', 'medida', 'tama_o', 'capacidad'].includes(field.key) || lead.group.options.some((name) => plain(name).replace(/[^a-z0-9]+/g, '_') === field.key))).map((field) => ({ key: field.key, value: field.value })),
    options: grouped ? lead.group.options.map((name, index) => ({ name, values: list.map((row) => row.group.values[index]) })) : [],
    variants: list.map((row) => ({ optionValues: grouped ? row.group.values : [], sku: row.sku, price: row.price, stock: row.stock > 0 })),
  }));
}

// CSV con el formato de importación de productos de Shopify, siempre como BORRADOR. Solo los que no se suman a un producto existente
// ni parecen duplicados; los agrupados salen como un producto con sus variantes.
export function shopifyImportCsv(rows = []) {
  const head = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'SEO Title', 'SEO Description', 'Status'];
  const products = draftGroups(rows);
  const lines = [];
  for (const { list, lead, grouped } of products) {
    const handle = handleOf(grouped ? groupTitle(lead) : lead.title) || handleOf(lead.sku);
    list.forEach((row, index) => {
      const opts = grouped ? lead.group.options : ['Title'];
      const vals = grouped ? row.group.values : ['Default Title'];
      const optCells = [0, 1, 2].flatMap((n) => (opts[n] ? [opts[n], vals[n]] : ['', '']));
      const first = index === 0;
      lines.push([
        handle, first ? (grouped ? groupTitle(lead) : lead.title) : '', first ? descriptionHtml(draftDescription(lead, grouped)) : '', first ? 'Poliplast' : '', '', first ? lead.tags.join(', ') : '', first ? 'FALSE' : '',
        ...optCells, row.sku, 'shopify', row.stock > 0 ? 999 : 0, 'deny', 'manual', row.price, 'TRUE', 'TRUE', first ? lead.image : '', first ? draftSeoTitle(lead, grouped) : '', first ? lead.seoDescription : '', first ? 'draft' : '',
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
