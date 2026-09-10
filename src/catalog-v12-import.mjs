import { normalizeSku } from './unified-commercial-catalog.mjs';

const REQUIRED_HEADERS = Object.freeze([
  'Tipo', 'SKU', 'Nombre', 'Familia', 'Subfamilia',
  'Costo USD vigente', 'Precio Final USD', 'Estado costo',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsFromMatrix(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0].map(clean);
  const rows = matrix.slice(1)
    .filter((values) => values.some((value) => clean(value)))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
  return { headers, rows };
}

function missingHeaders(headers) {
  const present = new Set(headers);
  return REQUIRED_HEADERS.filter((header) => !present.has(header));
}

function sourceRef(source = {}) {
  return {
    sourceType: 'catalogo_maestro_v12',
    sourceFileId: clean(source.fileId),
    sourceFileName: clean(source.fileName || 'Catalogo_Maestro_v12_LIMPIO_FINAL.xlsx'),
    sourceSheet: clean(source.sheet || 'Catalogo vigente'),
    importedAt: clean(source.importedAt),
  };
}

export function adaptCatalogV12({ currentMatrix = [], excludedMatrix = [], source = {} } = {}) {
  const current = rowsFromMatrix(currentMatrix);
  const excluded = rowsFromMatrix(excludedMatrix);
  const errors = [];
  const warnings = [];
  const absent = missingHeaders(current.headers);
  if (absent.length) errors.push({ code: 'encabezados_faltantes', headers: absent });

  const seen = new Set();
  const catalogRows = [];
  const costRows = [];
  const priceRows = [];
  const origin = sourceRef(source);

  current.rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const sku = normalizeSku(row.SKU);
    if (!sku) {
      errors.push({ code: 'sku_faltante', sourceRow });
      return;
    }
    if (seen.has(sku)) {
      errors.push({ code: 'sku_duplicado', sku, sourceRow });
      return;
    }
    seen.add(sku);

    const cost = optionalNumber(row['Costo USD vigente']);
    const price = optionalNumber(row['Precio Final USD']);
    const costStatus = clean(row['Estado costo']);
    if (cost === null) warnings.push({ code: 'costo_pendiente', sku, sourceRow });
    if (price === null) warnings.push({ code: 'precio_final_pendiente', sku, sourceRow });
    if (/revisar duplicado/i.test(costStatus)) warnings.push({ code: 'costo_marcado_revisar_duplicado', sku, sourceRow });

    catalogRows.push({
      sku,
      name: clean(row.Nombre),
      type: clean(row.Tipo),
      family: clean(row.Familia),
      subfamily: clean(row.Subfamilia),
      category: clean(row.Rubro),
      subcategory: clean(row['Sub Rubro']),
      confidence: clean(row.Confianza),
      isService: /^s[ií]$/i.test(clean(row.Es_servicio)) || clean(row.Tipo).toLocaleLowerCase('es-AR') === 'servicio',
      note: clean(row.Nota),
      strategicValue: clean(row['Valor estratégico']),
      isVariant: /^s[ií]$/i.test(clean(row.Es_variante)),
      targetAudience: clean(row.Publico_objetivo),
      targetAudienceDetail: clean(row.Publico_objetivo_detalle),
      active: true,
      sourceRow,
      ...origin,
    });

    costRows.push({
      sku,
      cost,
      costCurrency: 'USD',
      costSource: costStatus || origin.sourceFileName,
      costValidFrom: '',
      sourceRow,
      ...origin,
    });

    priceRows.push({
      sku,
      priceList: 'Precio final Catálogo Maestro v12',
      commercialLevel: 'sin_clasificar',
      price,
      currency: 'USD',
      vatRate: null,
      minQuantity: null,
      validFrom: '',
      validUntil: '',
      source: origin.sourceFileName,
      sourceRow,
      ...origin,
    });
  });

  const excludedRows = excluded.rows.map((row, index) => ({
    sku: normalizeSku(row.SKU),
    name: clean(row.Nombre),
    type: clean(row.Tipo),
    exclusionReason: clean(row.Motivo_exclusion),
    category: clean(row.Rubro),
    subcategory: clean(row['Sub Rubro']),
    active: false,
    sourceRow: index + 2,
    ...sourceRef({ ...source, sheet: 'Excluidos (no comercial)' }),
  }));

  return {
    catalogRows,
    costRows,
    priceRows,
    excludedRows,
    errors,
    warnings,
    summary: {
      current: catalogRows.length,
      excluded: excludedRows.length,
      costsPresent: costRows.filter((row) => row.cost !== null).length,
      finalPricesPresent: priceRows.filter((row) => row.price !== null).length,
      wholesalePricesVerified: 0,
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}

export { REQUIRED_HEADERS };
