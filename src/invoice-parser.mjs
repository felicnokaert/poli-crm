const POINT_OF_SALE_UNIT = {
  '0006': 'Poliplast',
  '0011': 'Poliplast',
  '0013': 'Poliplast',
  '0016': 'Poliplast',
  '0003': 'Poliocho',
};

function toNumber(value) {
  if (value === undefined || value === null) return 0;
  const clean = String(value).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoFromArgDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

// Cada renglón de ítems de las facturas de Contabilium tiene esta forma:
// "<cantidad> <código> <descripción> <precio unitario> <iva%> <bonif%> <importe>"
const ITEM_LINE = /^\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s*%\s+([\d.,]+)\s*%\s+([\d.,]+)\s*$/gm;

export function parseInvoiceText(text = '') {
  const clean = String(text).replace(/\r/g, '');
  const numberMatch = clean.match(/N[°ºo]?:?\s*(\d{4})-(\d+)/i);
  const dateMatch = clean.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const customerMatch = clean.match(/Raz[oó]n social:\s*([^\n]+)/i);
  const netGravadoMatch = clean.match(/Importe Neto Gravado:\s*(U\$S|\$)\s*([\d.,]+)/i);
  const exchangeRateMatch = clean.match(/Cotizaci[oó]n del D[oó]lar\s*\$\s*([\d.,]+)/i);
  const currency = netGravadoMatch && netGravadoMatch[1].toUpperCase() === 'U$S' ? 'USD' : 'ARS';

  const pointOfSale = numberMatch ? numberMatch[1] : '';
  const documentNumber = numberMatch ? numberMatch[2].slice(-5).padStart(5, '0') : '';
  const unit = POINT_OF_SALE_UNIT[pointOfSale] || '';

  const items = [];
  let match;
  ITEM_LINE.lastIndex = 0;
  while ((match = ITEM_LINE.exec(clean))) {
    items.push({
      quantity: toNumber(match[1]),
      code: match[2],
      description: match[3].trim(),
      unitPrice: toNumber(match[4]),
      ivaPercent: toNumber(match[5]),
      importe: toNumber(match[7]),
    });
  }

  const isInternalTax = (item) => /impuesto\s+interno/i.test(item.description);
  const internalTaxAmount = items.filter(isInternalTax).reduce((sum, item) => sum + item.importe, 0);
  // La comisión se calcula sobre el neto de los ítems de venta, nunca sobre
  // el impuesto interno (no es venta, es un impuesto que se traslada).
  const netAmount = items.filter((item) => !isInternalTax(item)).reduce((sum, item) => sum + item.importe, 0);

  return {
    unit,
    pointOfSale,
    documentNumber,
    date: dateMatch ? isoFromArgDate(dateMatch[1]) : '',
    customer: customerMatch ? customerMatch[1].trim() : '',
    netAmount: Math.round(netAmount * 100) / 100,
    netGravadoTotal: netGravadoMatch ? toNumber(netGravadoMatch[2]) : null,
    internalTaxExcluded: Math.round(internalTaxAmount * 100) / 100,
    currency,
    exchangeRate: exchangeRateMatch ? toNumber(exchangeRateMatch[1]) : null,
    items,
    recognized: Boolean(pointOfSale && documentNumber && unit),
  };
}
