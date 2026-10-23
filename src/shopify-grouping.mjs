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
  if (apply) { attrs['Aplicación'] = titleCase(apply[1] === 'canula' ? 'cánula' : apply[1]); rest = rest.replace(apply[0], ' '); }
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
  for (const { base, members } of groups.values()) {
    if (members.length < 2) continue;
    // Cada variante existente con sus valores: los del título del producto + sus propias opciones (ej. color).
    const rows = members.flatMap((member) => (member.variants.length ? member.variants : [null]).map((variant) => {
      const own = Object.fromEntries((variant?.options || []).filter((option) => option.name && option.name !== 'Title').map((option) => [titleCase(plain(option.name)), option.value]));
      const values = { ...member.attrs };
      for (const [name, value] of Object.entries(own)) if (!(name in values) || !values[name]) values[name] = value;
      return { member, variant, values };
    }));
    // Opciones que realmente varían; si falta el valor en alguna fila se completa con el valor por defecto del atributo.
    const names = [...new Set(rows.flatMap((row) => Object.keys(row.values)))];
    const defaults = { Tapa: 'Con tapa', Pack: 'x1', 'Línea': 'Estándar' };
    const varying = names.filter((name) => new Set(rows.map((row) => row.values[name] ?? defaults[name] ?? '—')).size > 1);
    if (!varying.length) continue;
    const ordered = [...varying].sort((a, b) => (PRIORITY.indexOf(a) === -1 ? 99 : PRIORITY.indexOf(a)) - (PRIORITY.indexOf(b) === -1 ? 99 : PRIORITY.indexOf(b)));
    const warnings = [];
    let options = ordered;
    if (ordered.length > 3) {
      options = [...ordered.slice(0, 2), 'Modelo'];
      warnings.push(`Hay ${ordered.length} opciones (${ordered.join(', ')}) y Shopify admite 3: ${ordered.slice(2).join(' + ')} se juntan en "Modelo".`);
    }
    const valueOf = (row, name) => row.values[name] ?? defaults[name] ?? '—';
    const proposed = rows.map((row) => {
      const picked = Object.fromEntries(options.map((name) => [name, name === 'Modelo' ? ordered.slice(2).map((part) => valueOf(row, part)).join(' · ') : valueOf(row, name)]));
      return { from: row, optionValues: picked };
    });
    const seen = new Map();
    for (const item of proposed) {
      const key = options.map((name) => item.optionValues[name]).join('|');
      if (seen.has(key)) warnings.push(`Dos variantes quedarían iguales (${options.map((name) => item.optionValues[name]).join(' / ')}): ${seen.get(key)} y ${item.from.member.product.title}.`);
      else seen.set(key, item.from.member.product.title);
    }
    if (proposed.length > 2048) warnings.push('Supera las 2.048 variantes que admite Shopify: dividirlo en dos productos.');
    const survivor = [...members].sort((a, b) => (statusRank[a.product.status] ?? 9) - (statusRank[b.product.status] ?? 9) || (b.product.total_inventory ?? 0) - (a.product.total_inventory ?? 0))[0].product;
    proposals.push({
      key: `${base}`, name: titleCase(base), products: members.map((member) => member.product), survivor,
      options: options.map((name) => ({ name, values: [...new Set(proposed.map((item) => item.optionValues[name]))] })),
      variants: proposed, warnings,
      activeProducts: members.filter((member) => member.product.status === 'ACTIVE').length,
    });
  }
  return proposals.sort((a, b) => b.products.length - a.products.length || a.name.localeCompare(b.name, 'es'));
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
