export const PRICE_STATUSES = Object.freeze([
  'pendiente',
  'confirmado',
  'vencido',
  'excepcion_manual',
]);

function finiteNumber(value) {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function priceFromMarkup(cost, markupRate) {
  const normalizedCost = finiteNumber(cost);
  const normalizedMarkup = finiteNumber(markupRate);
  if (normalizedCost === null || normalizedCost < 0 || normalizedMarkup === null || normalizedMarkup < 0) return null;
  return normalizedCost * (1 + normalizedMarkup);
}

export function priceFromMargin(cost, marginRate) {
  const normalizedCost = finiteNumber(cost);
  const normalizedMargin = finiteNumber(marginRate);
  if (normalizedCost === null || normalizedCost < 0 || normalizedMargin === null || normalizedMargin < 0 || normalizedMargin >= 1) return null;
  return normalizedCost / (1 - normalizedMargin);
}

export function commercialRates(cost, price) {
  const normalizedCost = finiteNumber(cost);
  const normalizedPrice = finiteNumber(price);
  if (normalizedCost === null || normalizedPrice === null || normalizedCost < 0 || normalizedPrice <= 0) {
    return { markupRate: null, marginRate: null };
  }
  return {
    markupRate: normalizedCost === 0 ? null : (normalizedPrice - normalizedCost) / normalizedCost,
    marginRate: (normalizedPrice - normalizedCost) / normalizedPrice,
  };
}

export function buildEditablePrice(input = {}) {
  const cost = finiteNumber(input.cost);
  const explicitPrice = finiteNumber(input.price);
  const markupRate = finiteNumber(input.markupRate);
  const marginRate = finiteNumber(input.marginRate);
  const calculationMode = input.calculationMode === 'margin' ? 'margin' : 'markup';
  const calculated = calculationMode === 'margin'
    ? priceFromMargin(cost, marginRate)
    : priceFromMarkup(cost, markupRate);
  const price = explicitPrice ?? calculated;
  const rates = commercialRates(cost, price);

  return {
    cost,
    costCurrency: String(input.costCurrency || '').trim().toUpperCase(),
    calculationMode,
    requestedMarkupRate: markupRate,
    requestedMarginRate: marginRate,
    price,
    effectiveMarkupRate: rates.markupRate,
    effectiveMarginRate: rates.marginRate,
    vatRate: finiteNumber(input.vatRate),
    status: PRICE_STATUSES.includes(input.status) ? input.status : 'pendiente',
    source: String(input.source || '').trim(),
    validFrom: input.validFrom || null,
    validUntil: input.validUntil || null,
    updatedBy: input.updatedBy || null,
    updatedAt: input.updatedAt || null,
    overrideReason: String(input.overrideReason || '').trim(),
  };
}

export function validateEditablePrice(price = {}) {
  const errors = [];
  if (price.status === 'confirmado' && !(price.price >= 0)) errors.push('precio_confirmado_sin_valor');
  if (price.status === 'confirmado' && !price.source) errors.push('precio_confirmado_sin_fuente');
  if (price.status === 'excepcion_manual' && !price.overrideReason) errors.push('excepcion_sin_motivo');
  if (price.price !== null && !price.costCurrency) errors.push('moneda_faltante');
  if (price.effectiveMarginRate !== null && price.effectiveMarginRate < 0) errors.push('margen_negativo');
  return { valid: errors.length === 0, errors };
}

export function appendPriceRevision(history = [], current = {}, next = {}, actor, changedAt) {
  return [...history, {
    previous: { ...current },
    next: { ...next },
    actor: actor || null,
    changedAt: changedAt || new Date().toISOString(),
  }];
}
