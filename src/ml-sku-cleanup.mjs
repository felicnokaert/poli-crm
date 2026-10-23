// SKU de Mercado Libre para ordenar (24/10): (1) el mismo producto cargado con dos SKU distintos (RE-608-0.750 y RE-608-750),
// que rompe el cruce de precios y de faltantes con Shopify, y (2) publicaciones activas sin SKU con una sugerencia sacada de otra
// publicación parecida que sí lo tiene. Solo propone: los SKU se corrigen a mano en Mercado Libre (el CRM no escribe en ML).
import { parseTitle } from './shopify-grouping.mjs';
import { similarity, skuStem, skuSuffixEquivalent } from './shopify-missing.mjs';

const key = (sku) => String(sku || '').trim().toUpperCase();
const sameShape = (a, b) => {
  const left = parseTitle(a).attrs; const right = parseTitle(b).attrs;
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const name of names) if (left[name] !== right[name]) return false;
  return true;
};
const sold = (item) => Number(item.sold_quantity) || 0;

export function skuCleanup(mlItems = []) {
  const active = mlItems.filter((item) => item.status === 'active');
  const withSku = active.filter((item) => key(item.sku));
  // Una publicación de referencia por SKU (la que más vendió).
  const bySku = new Map();
  for (const item of withSku) {
    const sku = key(item.sku);
    if (!bySku.has(sku) || sold(item) > sold(bySku.get(sku))) bySku.set(sku, item);
  }
  const byStem = new Map();
  for (const [sku, item] of bySku) {
    const stem = skuStem(sku);
    if (!stem) continue;
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push([sku, item]);
  }
  const similar = [];
  for (const [stem, entries] of byStem) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [skuA, a] = entries[i]; const [skuB, b] = entries[j];
        if (!skuSuffixEquivalent(skuA, skuB) || similarity(a.title, b.title) < 0.8 || !sameShape(a.title, b.title)) continue;
        const [keep, other] = sold(a) >= sold(b) ? [[skuA, a], [skuB, b]] : [[skuB, b], [skuA, a]];
        similar.push({ stem, keepSku: keep[0], keepTitle: keep[1].title, keepSold: sold(keep[1]), otherSku: other[0], otherTitle: other[1].title, otherSold: sold(other[1]), otherId: other[1].id, otherLink: other[1].permalink || '' });
      }
    }
  }
  const suggestions = active.filter((item) => !key(item.sku)).map((item) => {
    let best = null; let score = 0;
    for (const [sku, other] of bySku) {
      const value = similarity(item.title, other.title);
      if (value > score && sameShape(item.title, other.title)) { score = value; best = [sku, other]; }
    }
    // Se descarta la sugerencia si el SKU termina en un número que el título no nombra (ej. SKU -45 con título "47 Kg") o si el título
    // junta varios tamaños ("300 Y 450"): ahí no se sabe cuál corresponde.
    const tail = best ? key(best[0]).split('-').pop() : '';
    const numeric = /^\d+(?:\.\d+)?$/.test(tail);
    const nameIt = !numeric || new RegExp(`(^|[^0-9])${String(Number(tail)).replace('.', '[.,]')}([^0-9]|$)`).test(item.title);
    const several = /\b\d+\s*(?:y|\/|-)\s*\d+\b/i.test(item.title);
    const ok = best && score >= 0.85 && nameIt && !several;
    return { id: item.id, title: item.title, sold: sold(item), permalink: item.permalink || '', suggestedSku: ok ? best[0] : '', suggestedFrom: ok ? best[1].title : '' };
  }).sort((a, b) => b.sold - a.sold);
  return { similar: similar.sort((a, b) => b.otherSold + b.keepSold - (a.otherSold + a.keepSold)), suggestions };
}

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
// Hoja para corregir en Mercado Libre: qué SKU cambiar y por cuál.
export function skuCleanupCsv({ similar = [], suggestions = [] } = {}) {
  const head = ['Qué hacer', 'Publicación', 'SKU actual', 'SKU correcto', 'Vendidas', 'Link'];
  const lines = [
    ...similar.map((row) => ['Unificar SKU (mismo producto)', row.otherTitle, row.otherSku, row.keepSku, row.otherSold, row.otherLink]),
    ...suggestions.map((row) => ['Cargar SKU', row.title, '', row.suggestedSku || '(definir)', row.sold, row.permalink]),
  ].map((fields) => fields.map(cell).join(','));
  return `﻿${[head.map(cell).join(','), ...lines].join('\n')}`;
}
