const IMPORT_TYPES = Object.freeze(['catalogo', 'costos', 'precios', 'stock']);

const TYPE_FIELDS = Object.freeze({
  catalogo: ['name', 'family', 'subfamily', 'unit', 'active'],
  costos: ['cost', 'costCurrency', 'costSource', 'costValidFrom'],
  precios: ['priceList', 'price', 'currency', 'vatRate', 'minQuantity', 'validFrom', 'validUntil', 'source'],
  stock: ['locationId', 'quantity', 'unit', 'countedAt', 'source'],
});

function text(value) {
  return String(value ?? '').trim();
}

function skuKey(value) {
  return text(value).toLocaleUpperCase('es-AR');
}

function comparable(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value.trim();
  return value;
}

function sameValue(a, b) {
  return comparable(a) === comparable(b);
}

function errorsFor(row, type, existingBySku) {
  const errors = [];
  const sku = skuKey(row.sku);
  if (!sku) errors.push('sku_faltante');
  if (!IMPORT_TYPES.includes(type)) errors.push('tipo_importacion_invalido');
  if (type !== 'catalogo' && sku && !existingBySku.has(sku)) errors.push('sku_desconocido');
  if (type === 'catalogo' && !text(row.name)) errors.push('nombre_faltante');
  if (type === 'catalogo' && !text(row.family)) errors.push('familia_faltante');
  if (type === 'costos' && row.cost !== '' && row.cost !== null && row.cost !== undefined && !(Number(row.cost) >= 0)) errors.push('costo_invalido');
  if (type === 'costos' && Number(row.cost) >= 0 && !text(row.costCurrency)) errors.push('moneda_costo_faltante');
  if (type === 'precios' && !text(row.priceList)) errors.push('lista_precio_faltante');
  if (type === 'precios' && row.price !== '' && row.price !== null && row.price !== undefined && !(Number(row.price) >= 0)) errors.push('precio_invalido');
  if (type === 'stock' && !text(row.locationId)) errors.push('deposito_faltante');
  if (type === 'stock' && !(Number(row.quantity) >= 0)) errors.push('cantidad_stock_invalida');
  if (type === 'stock' && !text(row.countedAt)) errors.push('fecha_conteo_faltante');
  return errors;
}

function changedFields(row, current, type) {
  return (TYPE_FIELDS[type] || []).filter((field) => !sameValue(row[field], current?.[field]));
}

export function previewCatalogAdminImport({ type, rows = [], existing = [] } = {}) {
  const existingBySku = new Map(existing.map((row) => [skuKey(row.sku), row]));
  const counts = new Map();
  for (const row of rows) {
    const sku = skuKey(row.sku);
    if (sku) counts.set(sku, (counts.get(sku) || 0) + 1);
  }

  const preview = { altas: [], cambios: [], sinCambios: [], conflictos: [], errores: [] };
  rows.forEach((raw, index) => {
    const row = { ...raw, sku: skuKey(raw.sku) };
    const rowErrors = errorsFor(row, type, existingBySku);
    if (row.sku && counts.get(row.sku) > 1) rowErrors.push('sku_repetido_en_lote');
    const result = { index, sku: row.sku, row, errors: [...new Set(rowErrors)] };
    if (result.errors.length) {
      const target = result.errors.includes('sku_repetido_en_lote') ? preview.conflictos : preview.errores;
      target.push(result);
      return;
    }

    const current = existingBySku.get(row.sku);
    if (!current) {
      preview.altas.push({ ...result, changedFields: TYPE_FIELDS[type] || [] });
      return;
    }
    const changes = changedFields(row, current, type);
    if (changes.length) preview.cambios.push({ ...result, current, changedFields: changes });
    else preview.sinCambios.push({ ...result, current, changedFields: [] });
  });
  return preview;
}

export function adminImportSummary(preview = {}) {
  return {
    altas: preview.altas?.length || 0,
    cambios: preview.cambios?.length || 0,
    sinCambios: preview.sinCambios?.length || 0,
    conflictos: preview.conflictos?.length || 0,
    errores: preview.errores?.length || 0,
  };
}

export function canApplyAdminImport(preview = {}) {
  return (preview.conflictos?.length || 0) === 0 && (preview.errores?.length || 0) === 0;
}

export function exportableCatalogRow(row = {}, { canViewCosts = false } = {}) {
  const publicRow = {
    sku: row.sku ?? '',
    name: row.name ?? '',
    family: row.family ?? '',
    subfamily: row.subfamily ?? '',
    unit: row.unit ?? '',
    price: row.price ?? '',
    currency: row.currency ?? '',
    stock: row.stock ?? '',
    stockAsOf: row.stockAsOf ?? '',
  };
  if (!canViewCosts) return publicRow;
  return {
    ...publicRow,
    cost: row.cost ?? '',
    costCurrency: row.costCurrency ?? '',
    effectiveMarkupRate: row.effectiveMarkupRate ?? '',
    effectiveMarginRate: row.effectiveMarginRate ?? '',
  };
}

export { IMPORT_TYPES };
