function normalizeProduct(value = '') {
  return String(value)
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Un producto puede haberse vendido varias veces; nos quedamos con la
// cotización más reciente por descripción normalizada.
export function buildPriceMemory(sales = []) {
  const byProduct = new Map();
  for (const sale of sales) {
    for (const item of sale.items || []) {
      const key = normalizeProduct(item.description || item.code || '');
      if (!key || !(item.unitPrice > 0)) continue;
      const entry = {
        key,
        description: item.description || item.code,
        code: item.code || '',
        unitPrice: Number(item.unitPrice),
        currency: sale.currency || 'ARS',
        date: sale.date || '',
        customer: sale.customer || '',
        unit: sale.unit || '',
      };
      const existing = byProduct.get(key);
      if (!existing || String(entry.date) > String(existing.date)) byProduct.set(key, entry);
    }
  }
  return byProduct;
}

export function findPriceMatches(memory, query, limit = 5) {
  const q = normalizeProduct(query);
  if (!q) return [];
  const terms = q.split(' ').filter(Boolean);
  const matches = [];
  for (const entry of memory.values()) {
    if (terms.every((term) => entry.key.includes(term))) matches.push(entry);
  }
  return matches.slice(0, limit);
}

export function quotePrice(entry, quantity = 1) {
  const qty = Number(quantity) || 0;
  return {
    unitPrice: entry.unitPrice,
    quantity: qty,
    total: Math.round(entry.unitPrice * qty * 100) / 100,
    currency: entry.currency,
  };
}
