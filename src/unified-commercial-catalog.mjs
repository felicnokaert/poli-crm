const FALLBACK_BRAND = 'GRUPO POLIPLAST';

export const BRAND_PRESENTATIONS = Object.freeze({
  'GRUPO POLIPLAST': { key: 'grupo-poliplast', coBrand: false },
  PENOSIL: { key: 'penosil', coBrand: true },
  RESINPLAST: { key: 'resinplast', coBrand: true },
  PURMAC: { key: 'purmac', coBrand: true },
});

export function normalizeCatalogText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-AR');
}

export function normalizeSku(value = '') {
  return String(value).trim().toUpperCase().replace(/\s+/g, '');
}

export function buildCatalogVariant(input = {}) {
  const sku = normalizeSku(input.sku);
  return {
    id: String(input.id || sku).trim(),
    sku,
    brand: String(input.brand || input.family || FALLBACK_BRAND).trim().toUpperCase(),
    family: String(input.family || 'Sin definir').trim(),
    subfamily: String(input.subfamily || 'Sin definir').trim(),
    productName: String(input.productName || input.base || input.name || '').trim(),
    variantName: String(input.variantName || input.variant || '').trim(),
    unit: String(input.unit || '').trim(),
    attributes: input.attributes && typeof input.attributes === 'object' ? { ...input.attributes } : {},
    imageUrl: String(input.imageUrl || '').trim(),
    status: String(input.status || input.validation || 'pendiente').trim(),
    priceStatus: String(input.priceStatus || 'pendiente').trim(),
  };
}

export function catalogIntegrityReport(items = []) {
  const seen = new Map();
  const duplicateSkus = new Map();
  const missingSku = [];
  const missingClassification = [];

  items.forEach((raw, index) => {
    const item = buildCatalogVariant(raw);
    if (!item.sku) missingSku.push({ index, item });
    if (!item.family || item.family === 'Sin definir' || !item.subfamily || item.subfamily === 'Sin definir') {
      missingClassification.push({ index, item });
    }
    if (!item.sku) return;
    if (seen.has(item.sku)) {
      duplicateSkus.set(item.sku, [...(duplicateSkus.get(item.sku) || [seen.get(item.sku)]), { index, item }]);
    } else {
      seen.set(item.sku, { index, item });
    }
  });

  return {
    total: items.length,
    valid: items.length - missingSku.length - duplicateSkus.size,
    duplicateSkus: [...duplicateSkus.entries()].map(([sku, occurrences]) => ({ sku, occurrences })),
    missingSku,
    missingClassification,
    canImport: duplicateSkus.size === 0 && missingSku.length === 0,
  };
}

export function filterCatalog(items = [], filters = {}) {
  const query = normalizeCatalogText(filters.query);
  const expectedBrand = normalizeCatalogText(filters.brand);
  const expectedFamily = normalizeCatalogText(filters.family);
  const expectedSubfamily = normalizeCatalogText(filters.subfamily);
  const priceStatus = normalizeCatalogText(filters.priceStatus);

  return items.map(buildCatalogVariant).filter((item) => {
    const searchable = normalizeCatalogText([
      item.sku,
      item.brand,
      item.family,
      item.subfamily,
      item.productName,
      item.variantName,
    ].join(' '));
    return (!query || searchable.includes(query))
      && (!expectedBrand || normalizeCatalogText(item.brand) === expectedBrand)
      && (!expectedFamily || normalizeCatalogText(item.family) === expectedFamily)
      && (!expectedSubfamily || normalizeCatalogText(item.subfamily) === expectedSubfamily)
      && (!priceStatus || normalizeCatalogText(item.priceStatus) === priceStatus);
  });
}

export function groupProductsWithVariants(items = []) {
  const groups = new Map();
  for (const item of items.map(buildCatalogVariant)) {
    const key = [item.brand, item.family, item.subfamily, normalizeCatalogText(item.productName)].join('|');
    const current = groups.get(key) || {
      key,
      brand: item.brand,
      family: item.family,
      subfamily: item.subfamily,
      productName: item.productName,
      variants: [],
    };
    current.variants.push(item);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function resolveDocumentBrand(items = []) {
  const brands = [...new Set(items.map((item) => buildCatalogVariant(item).brand).filter(Boolean))];
  if (brands.length !== 1) {
    return { primary: FALLBACK_BRAND, secondary: [], template: BRAND_PRESENTATIONS[FALLBACK_BRAND], mixed: true };
  }
  const brand = brands[0];
  const presentation = BRAND_PRESENTATIONS[brand];
  if (!presentation || brand === FALLBACK_BRAND) {
    return { primary: FALLBACK_BRAND, secondary: [], template: BRAND_PRESENTATIONS[FALLBACK_BRAND], mixed: false };
  }
  return { primary: FALLBACK_BRAND, secondary: [brand], template: presentation, mixed: false };
}

export function suggestTechnicalDocuments(item, documents = []) {
  const product = buildCatalogVariant(item);
  return documents.filter((document) => {
    if (document.status !== 'vigente') return false;
    const documentSku = normalizeSku(document.sku);
    if (documentSku && documentSku === product.sku) return true;
    const sameProduct = normalizeCatalogText(document.product) === normalizeCatalogText(product.productName);
    const sameSubfamily = normalizeCatalogText(document.subfamily) === normalizeCatalogText(product.subfamily);
    const sameFamily = normalizeCatalogText(document.family) === normalizeCatalogText(product.family);
    return sameProduct || (sameFamily && sameSubfamily && Boolean(document.appliesToSubfamily));
  });
}
