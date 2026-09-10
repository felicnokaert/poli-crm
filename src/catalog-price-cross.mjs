import { normalizeCatalogText, normalizeSku } from './unified-commercial-catalog.mjs';

function priceKey(row = {}) {
  return [
    normalizeSku(row.sourceSku),
    normalizeCatalogText(row.priceList),
    String(row.minQuantity ?? ''),
    normalizeCatalogText(row.unit),
  ].join('|');
}

function normalizedAliases(aliases = {}) {
  return new Map(Object.entries(aliases).map(([sourceSku, catalogSku]) => [normalizeSku(sourceSku), normalizeSku(catalogSku)]));
}

export function crossPriceRowsWithCatalog({ priceRows = [], catalogRows = [], skuAliases = {} } = {}) {
  const catalogBySku = new Map(catalogRows.map((row) => [normalizeSku(row.sku), row]));
  const aliases = normalizedAliases(skuAliases);
  const seen = new Set();
  const result = { exact: [], aliased: [], unresolved: [], conflicts: [], errors: [] };

  priceRows.forEach((raw, index) => {
    const row = { ...raw, sourceSku: normalizeSku(raw.sourceSku || raw.sku) };
    if (!row.sourceSku) {
      result.unresolved.push({ index, row, reason: 'sku_fuente_faltante' });
      return;
    }
    const key = priceKey(row);
    if (seen.has(key)) {
      result.conflicts.push({ index, row, reason: 'precio_repetido_en_fuente' });
      return;
    }
    seen.add(key);

    const exactProduct = catalogBySku.get(row.sourceSku);
    if (exactProduct) {
      result.exact.push({ index, row: { ...row, sku: row.sourceSku }, product: exactProduct, match: 'exacto' });
      return;
    }

    const aliasSku = aliases.get(row.sourceSku);
    const aliasProduct = aliasSku ? catalogBySku.get(aliasSku) : null;
    if (aliasProduct) {
      result.aliased.push({ index, row: { ...row, sku: aliasSku }, product: aliasProduct, match: 'alias_aprobado' });
      return;
    }
    result.unresolved.push({ index, row, reason: aliasSku ? 'alias_apunta_a_sku_inexistente' : 'sku_sin_coincidencia' });
  });

  return result;
}

export function priceCrossSummary(result = {}) {
  return {
    exact: result.exact?.length || 0,
    aliased: result.aliased?.length || 0,
    unresolved: result.unresolved?.length || 0,
    conflicts: result.conflicts?.length || 0,
    errors: result.errors?.length || 0,
    importable: (result.exact?.length || 0) + (result.aliased?.length || 0),
  };
}

export function rowsApprovedForPriceImport(result = {}) {
  return [...(result.exact || []), ...(result.aliased || [])].map(({ row }) => row);
}
