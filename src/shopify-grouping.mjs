// Ordenar el catálogo de Shopify (24/10, Felipe: "agrupar todo el MISMO producto por variante": resina por peso, baldes
// con tapa y sin tapa, por tamaño…). Detecta productos que son el mismo y solo cambian en tamaño, pack, tapa, línea o color,
// y arma la propuesta de UN producto con opciones y variantes. Solo propone: no escribe nada en Shopify. Shopify admite
// 3 opciones como máximo y hasta 2.048 variantes por producto; si hacen falta más opciones se juntan en "Modelo".
import { plain } from './knowledge-search.mjs';

const COLORS = ['negro', 'blanco', 'rojo', 'azul', 'amarillo', 'verde', 'gris', 'naranja', 'celeste', 'rosa', 'violeta', 'marron', 'transparente', 'cristal', 'natural'];
const UNITS = { kg: 'Peso', g: 'Peso', gr: 'Peso', l: 'Capacidad', lt: 'Capacidad', lts: 'Capacidad', ml: 'Capacidad', cc: 'Capacidad', m: 'Medida', mt: 'Medida', mts: 'Medida', cm: 'Medida', mm: 'Medida', m2: 'Superficie' };
const UNIT_LABEL = { gr: 'g', lt: 'L', lts: 'L', l: 'L', mt: 'm', mts: 'm' };
const SIZE = /(\d+(?:[.,]\d+)?)\s?(kg|gr|g|lts|lt|l|ml|cc|m2|mts|mt|m|cm|mm)\b/;
const SIZE_ALL = new RegExp(SIZE.source, 'g');
const PACK = /\bx\s?(\d+)\b(?![.,]\d)(?!\s?(?:kg|gr|g|lts|lt|l|ml|cc|m2|mts|mt|m|cm|mm|u|un|unid)\b)/;
const PRIORITY = ['Capacidad', 'Peso', 'Medida', 'Superficie', 'Talle', 'Aplicación', 'Cuerpo', 'Pack', 'Color', 'Tapa', 'Línea'];

// Las opciones propias de cada variante vienen con nombres distintos según cómo se cargó el producto: "canula" o "pistola" con
// valor "Default Title" (kits) son la MISMA opción "Aplicación"; "Contenido", "cantidad" y "pack" son el mismo "Pack" (x1, x3…).
export function normalizeOption(name = '', value = '') {
  const key = plain(String(name)).trim();
  const text = String(value ?? '').trim();
  if (['canula', 'manual', 'pistola'].includes(key)) {
    if (!text || /^default title$/i.test(text) || /^(si|sí|1)$/i.test(text)) return ['Aplicación', key === 'pistola' ? 'Pistola' : 'Manual'];
    return ['Aplicación', titleCase(plain(text) === 'canula' ? 'manual' : text)];
  }
  if (['aplicacion', 'modo de aplicacion', 'tipo de aplicacion'].includes(key)) return ['Aplicación', titleCase(plain(text) === 'canula' ? 'manual' : text)];
  if (['contenido', 'cantidad', 'pack', 'unidades', 'presentacion'].includes(key)) {
    const pack = /^x?\s?(\d+)$/i.exec(text);
    return ['Pack', pack ? `x${pack[1]}` : text];
  }
  return [titleCase(key), text];
}

const titleCase = (text) => text.replace(/\s+/g, ' ').trim().replace(/(^|\s)(\S)/g, (match, space, letter) => space + letter.toUpperCase());

// Atributos que se detectan en el título; lo que queda es el "nombre base".
export function parseTitle(title = '') {
  let rest = ` ${plain(title)} `;
  const attrs = {};
  const sizes = [...rest.matchAll(SIZE_ALL)];
  if (sizes.length > 1) {
    // Varias medidas juntas (ej. 100mm x 1,5mm x 50m) son las dimensiones de un mismo artículo.
    attrs.Medida = sizes.map((match) => `${match[1].replace('.', ',')} ${UNIT_LABEL[match[2]] || match[2]}`).join(' x ');
    for (const match of sizes) rest = rest.replace(match[0], ' ');
    rest = rest.replace(/\bx\b/g, ' ');
  } else if (sizes.length === 1) {
    const unit = sizes[0][2];
    attrs[UNITS[unit]] = `${sizes[0][1].replace('.', ',')} ${UNIT_LABEL[unit] || unit}`;
    rest = rest.replace(sizes[0][0], ' ');
  }
  const pack = PACK.exec(rest);
  if (pack) { attrs.Pack = `x${pack[1]}`; rest = rest.replace(pack[0], ' '); }
  if (/\bsin tapa\b/.test(rest)) { attrs.Tapa = 'Sin tapa'; rest = rest.replace(/\bsin tapa\b/, ' '); }
  else if (/\bcon tapa\b/.test(rest)) { attrs.Tapa = 'Con tapa'; rest = rest.replace(/\bcon tapa\b/, ' '); }
  if (/\beconomic[oa]s?\b/.test(rest)) { attrs['Línea'] = 'Económico'; rest = rest.replace(/\beconomic[oa]s?\b/, ' '); }
  const apply = /\b(manual|pistola|canula)\b/.exec(rest);
  if (apply) { attrs['Aplicación'] = titleCase(apply[1] === 'pistola' ? 'pistola' : 'manual'); rest = rest.replace(apply[0], ' '); }
  const body = /\bcuerpo (alto|bajo)\b/.exec(rest);
  if (body) { attrs.Cuerpo = titleCase(body[1]); rest = rest.replace(body[0], ' '); }
  const talle = /\btalle (xxl|xl|xs|s|m|l)\b/.exec(rest);
  if (talle) { attrs.Talle = talle[1].toUpperCase(); rest = rest.replace(talle[0], ' '); }
  const color = COLORS.find((name) => new RegExp(`\\b${name}\\b`).test(rest));
  if (color) { attrs.Color = titleCase(color); rest = rest.replace(new RegExp(`\\b${color}\\b`), ' '); }
  const base = rest.replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return { base, attrs };
}

const statusRank = { ACTIVE: 0, DRAFT: 1, UNLISTED: 2, ARCHIVED: 3 };

// Propuestas de agrupación: productos con el mismo nombre base (y mismo tipo) que difieren en algún atributo.
export function groupProposals(products = [], variants = []) {
  const byProduct = new Map();
  for (const variant of variants) {
    if (!byProduct.has(variant.product_id)) byProduct.set(variant.product_id, []);
    byProduct.get(variant.product_id).push(variant);
  }
  const groups = new Map();
  for (const product of products) {
    if (product.status === 'ARCHIVED') continue;
    const parsed = parseTitle(product.title);
    if (!parsed.base) continue;
    const key = `${plain(product.product_type)}|${parsed.base}`;
    if (!groups.has(key)) groups.set(key, { base: parsed.base, members: [] });
    groups.get(key).members.push({ product, attrs: parsed.attrs, variants: byProduct.get(product.id) || [] });
  }
  const proposals = [];
  const defaults = { Tapa: 'Con tapa', Pack: 'x1', 'Línea': 'Estándar' };
  const valueOf = (row, name) => row.values[name] ?? defaults[name] ?? '—';
  const rank = (name) => (PRIORITY.indexOf(name) === -1 ? 99 : PRIORITY.indexOf(name));
  // Si hay más de 3 opciones que varían, se parte en varios productos por la dimensión que más separa
  // (capacidad, peso o medida; después la línea) en vez de apretar todo en una opción "Modelo".
  const SPLIT_BY = ['Capacidad', 'Peso', 'Medida', 'Superficie', 'Línea'];
  const build = (name, base, rows, parts = []) => {
    const members = [...new Set(rows.map((row) => row.member))];
    if (members.length < 2) return; // un solo producto no se fusiona con nada
    const names = [...new Set(rows.flatMap((row) => Object.keys(row.values)))];
    const varying = names.filter((key) => new Set(rows.map((row) => valueOf(row, key))).size > 1);
    if (!varying.length && !parts.length) return;
    const ordered = [...varying].sort((x, y) => rank(x) - rank(y));
    const splitter = ordered.length > 3 ? SPLIT_BY.find((key) => ordered.includes(key)) : null;
    if (splitter) {
      const byValue = new Map();
      for (const row of rows) { const value = valueOf(row, splitter); if (!byValue.has(value)) byValue.set(value, []); byValue.get(value).push(row); }
      for (const [value, subset] of byValue) build(`${name} · ${splitter === 'Línea' ? `línea ${value}` : value}`, base, subset, [...parts, value]);
      return;
    }
    if (!ordered.length) return;
    const warnings = [];
    let options = ordered;
    if (ordered.length > 3) {
      options = [...ordered.slice(0, 2), 'Modelo'];
      warnings.push(`Hay ${ordered.length} opciones (${ordered.join(', ')}) y Shopify admite 3: ${ordered.slice(2).join(' + ')} se juntan en "Modelo".`);
    }
    const proposed = rows.map((row) => {
      const picked = Object.fromEntries(options.map((key) => [key, key === 'Modelo' ? ordered.slice(2).map((part) => valueOf(row, part)).join(' · ') : valueOf(row, key)]));
      return { from: row, optionValues: picked };
    });
    const seen = new Map();
    for (const item of proposed) {
      const key = options.map((key2) => item.optionValues[key2]).join('|');
      if (seen.has(key)) warnings.push(`Dos variantes quedarían iguales (${options.map((key2) => item.optionValues[key2]).join(' / ')}): ${seen.get(key)} y ${item.from.member.product.title}.`);
      else seen.set(key, item.from.member.product.title);
    }
    // SKU repetidos: hay que corregirlos antes de fusionar (si no, se mezclan stock y precio).
    const bySku = new Map();
    for (const item of proposed) { const sku = item.from.variant?.sku; if (sku) { if (!bySku.has(sku)) bySku.set(sku, []); bySku.get(sku).push(options.map((key) => item.optionValues[key]).join(' / ')); } }
    for (const [sku, where] of bySku) if (where.length > 1) warnings.push(`SKU repetido ${sku}: ${where.join(' y ')}. Corregilo antes de fusionar.`);
    // Mismo tamaño y presentación con precios muy distintos según el color: puede ser un error de carga o una línea aparte.
    const byShape = new Map();
    for (const item of proposed) {
      const price = Number(item.from.variant?.price);
      if (!(price > 0)) continue;
      const key = options.filter((key2) => key2 !== 'Color').map((key2) => item.optionValues[key2]).join(' / ');
      const entry = byShape.get(key) || { min: Infinity, max: 0 };
      entry.min = Math.min(entry.min, price); entry.max = Math.max(entry.max, price);
      byShape.set(key, entry);
    }
    for (const [shape, range] of byShape) if (range.max / range.min >= 1.4) warnings.push(`Precios muy distintos para lo mismo (${shape || 'todas'}): de $${Math.round(range.min).toLocaleString('es-AR')} a $${Math.round(range.max).toLocaleString('es-AR')}. La ficha mostraría "desde" el menor.`);
    if (proposed.length > 2048) warnings.push('Supera las 2.048 variantes que admite Shopify: dividirlo en dos productos.');
    const survivor = [...members].sort((x, y) => (statusRank[x.product.status] ?? 9) - (statusRank[y.product.status] ?? 9) || (y.product.total_inventory ?? 0) - (x.product.total_inventory ?? 0))[0].product;
    proposals.push({
      key: `${base}|${parts.join('|')}`, name: titleCase(name), products: members.map((member) => member.product), survivor,
      options: options.map((key) => ({ name: key, values: [...new Set(proposed.map((item) => item.optionValues[key]))] })),
      variants: proposed, warnings,
      activeProducts: members.filter((member) => member.product.status === 'ACTIVE').length,
    });
  };
  for (const { base, members } of groups.values()) {
    if (members.length < 2) continue;
    // Cada variante existente con sus valores: los del título del producto + sus propias opciones (ej. color).
    const rows = members.flatMap((member) => (member.variants.length ? member.variants : [null]).map((variant) => {
      const own = Object.fromEntries((variant?.options || []).filter((option) => option.name && option.name !== 'Title').map((option) => normalizeOption(option.name, option.value)));
      const values = { ...member.attrs };
      for (const [name, value] of Object.entries(own)) if (!(name in values) || !values[name]) values[name] = value;
      return { member, variant, values };
    }));
    build(titleCase(base), base, rows);
  }
  return proposals.sort((a, b) => b.products.length - a.products.length || a.name.localeCompare(b.name, 'es'));
}

// Pedido para crear el producto unificado como BORRADOR (lib/shopify-write.mjs): copia descripción, fotos y SEO del producto base y
// no toca los originales. Los SKU repetidos son a propósito: los originales siguen activos hasta que se los archive a mano.
export function proposalSpec(proposal) {
  const seen = new Set();
  const variants = [];
  for (const item of proposal.variants) {
    const variant = item.from.variant;
    if (!variant) continue;
    const optionValues = proposal.options.map((option) => item.optionValues[option.name]);
    const id = optionValues.join('|');
    if (seen.has(id)) continue; // dos variantes iguales: Shopify las rechaza; la propuesta ya avisa
    seen.add(id);
    variants.push({ optionValues, sku: variant.sku || '', price: variant.price, compareAtPrice: variant.compare_at_price, stock: Number(variant.inventory_quantity) > 0 });
  }
  return {
    title: proposal.name, copyFrom: proposal.survivor.id, allowExistingSku: true, tags: ['agrupado-por-crm'],
    options: proposal.options.map((option) => ({ name: option.name, values: option.values })), variants: variants.slice(0, 100),
  };
}

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
// CSV de la propuesta: una fila por variante, para revisarla en una planilla antes de decidir.
export function proposalsCsv(proposals = []) {
  const head = ['Producto propuesto', 'Opción 1', 'Opción 2', 'Opción 3', 'Producto actual', 'Variante actual', 'SKU', 'Precio', 'Stock', 'Aviso'];
  const lines = proposals.flatMap((proposal) => proposal.variants.map((item) => [
    proposal.name, ...[0, 1, 2].map((index) => (proposal.options[index] ? `${proposal.options[index].name}: ${item.optionValues[proposal.options[index].name]}` : '')),
    item.from.member.product.title, item.from.variant?.title || '', item.from.variant?.sku || '', item.from.variant?.price ?? '', item.from.variant?.inventory_quantity ?? '', proposal.warnings.join(' | '),
  ].map(cell).join(',')));
  return `﻿${[head.map(cell).join(','), ...lines].join('\n')}`;
}
