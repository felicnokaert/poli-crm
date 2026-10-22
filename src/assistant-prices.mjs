// Precios de lista para el asistente (22/10, Felipe: "tiene que responder mejor"): cuando preguntan cuánto
// sale algo, busca el producto en el catálogo del cotizador (catalog_variants) y trae los precios de las listas
// vigentes (price_lists + variant_prices), con la misma regla que el cotizador (poliplast-cotizador
// src/lib/pricing.ts): lista 'vigente', precio 'confirmado' y dentro de las fechas. Los importes de lista son
// FINALES con IVA incluido; el neto es importe / (1 + IVA). Las reglas comerciales por cantidad del cotizador
// no se aplican acá: se avisa.
import { plain } from './knowledge-search.mjs';

const ASK = /\b(precio\w*|cuanto (sale|salen|cuesta|cuestan|vale|valen|esta|estan)|a cuanto (esta|lo|la|los|las|sale|vendemos)|valor|lista de precios|cotiz\w*|mayorista)\b/;
export const asksPrice = (query) => ASK.test(plain(query));

const FILLER = new Set(['el', 'la', 'lo', 'le', 'de', 'un', 'en', 'al', 'es', 'me', 'nos', 'precio', 'precios', 'cuanto', 'sale', 'salen', 'cuesta', 'cuestan', 'vale', 'valen', 'esta', 'estan', 'valor', 'lista', 'listas', 'cotizar', 'cotizacion', 'mayorista', 'mayoristas', 'consumidor', 'final', 'del', 'los', 'las', 'una', 'uno', 'que', 'para', 'con', 'por', 'hoy', 'actual', 'vigente', 'tiene', 'tenemos', 'dame', 'decime', 'pasame', 'quiero', 'saber', 'vendemos', 'cliente']);
export function priceWords(query) {
  return [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !FILLER.has(word)))].slice(0, 4);
}

const listIsCurrent = (price, list, today) => list && list.status === 'vigente' && price.status === 'confirmado' && list.valid_from <= today && (!list.valid_until || list.valid_until >= today);
const isWholesale = (name) => /mayorista|distribuidor/i.test(name || '');
const money = (value, currency) => `${currency === 'USD' ? 'USD' : '$'} ${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// variants: [{id, sku, name}], prices: variant_prices, lists: price_lists → [{variant, rows:[{list, from, to, gross, net, vat, currency}]}]
export function currentListPrices({ variants = [], prices = [], lists = [], today }) {
  const byList = new Map(lists.map((list) => [list.id, list]));
  return variants.map((variant) => {
    const rows = prices
      .filter((price) => price.variant_id === variant.id && listIsCurrent(price, byList.get(price.price_list_id), today))
      .map((price) => {
        const list = byList.get(price.price_list_id);
        const vat = Number.isFinite(Number(list.vat_rate)) && list.vat_rate !== null ? Number(list.vat_rate) : 0.21;
        const gross = Number(price.amount);
        return { list: list.name, wholesale: isWholesale(list.name), from: Number(price.min_quantity) || 1, to: price.max_quantity == null ? null : Number(price.max_quantity), gross, net: gross / (1 + vat), vat, currency: list.currency, validFrom: list.valid_from };
      })
      .sort((a, b) => Number(a.wholesale) - Number(b.wholesale) || a.from - b.from || b.validFrom.localeCompare(a.validFrom));
    // Si hay dos listas vigentes del mismo tipo y tramo, queda la más nueva (como el cotizador).
    const seen = new Set();
    return { variant, rows: rows.filter((row) => { const key = `${row.wholesale}|${row.from}`; if (seen.has(key)) return false; seen.add(key); return true; }) };
  }).filter((entry) => entry.rows.length);
}

export function priceLine(row) {
  const range = row.to ? `de ${row.from} a ${row.to} u.` : row.from > 1 ? `desde ${row.from} u.` : '';
  return `${row.list}${range ? ` (${range})` : ''}: ${money(row.gross, row.currency)} final · ${money(row.net, row.currency)} + IVA ${Math.round(row.vat * 100)} %`;
}

export function pricesContext(entries = []) {
  if (!entries.length) return '';
  return ['PRECIOS DE LISTA VIGENTES (del catálogo del cotizador; importes FINALES con IVA incluido y su neto + IVA; para un pedido real el cotizador puede aplicar reglas por cantidad, mayorista o forma de pago):',
    ...entries.slice(0, 6).map(({ variant, rows }) => `- ${variant.name}${variant.sku ? ` [${variant.sku}]` : ''}: ${rows.map(priceLine).join(' | ')}`)].join('\n');
}
