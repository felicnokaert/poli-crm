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
// La columna de Bonif. no siempre está (hay formatos con solo IVA%), así que
// ese grupo queda opcional; sin él, las líneas nunca matcheaban y la venta
// se guardaba con importe $0 sin avisar.
const ITEM_LINE = /^\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s*%\s+(?:([\d.,]+)\s*%\s+)?([\d.,]+)\s*$/gm;

// Contabilium usa el mismo "Nº: XXXX-XXXXX" para Facturas, Remitos, Notas de
// crédito, etc. Un Remito trae la misma numeración pero sin precio por
// renglón (Cantidad/Código/Descripción nomás) - antes se colaba como
// "reconocida" y se guardaba una venta con importe $0 sin avisar.
const NON_INVOICE_TYPES = [
  ['Remito', /\bRemito\b/i],
  ['Nota de crédito', /Nota de Cr[ée]dito/i],
  ['Nota de débito', /Nota de D[ée]bito/i],
  ['Recibo', /\bRecibo\b/i],
];

export function parseInvoiceText(text = '') {
  const clean = String(text).replace(/\r/g, '');
  const detectedNonInvoiceType = NON_INVOICE_TYPES.find(([, pattern]) => pattern.test(clean));
  const numberMatch = clean.match(/N[°ºo]?:?\s*(\d{4})-(\d+)/i);
  const dateMatch = clean.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const customerMatch = clean.match(/Raz[oó]n social:\s*([^\n]+)/i);
  // El párrafo largo de "tipo de cambio" a veces se corta a mitad de palabra
  // entre dos líneas del PDF ("Coti" / "zación"), sin espacio de por medio.
  // Sacar los saltos de línea reconstruye la palabra para poder buscarla.
  const flat = clean.replace(/\n/g, '');
  const netGravadoMatch = clean.match(/Importe Neto Gravado:\s*(U\$S|\$)\s*([\d.,]+)/i) || flat.match(/Importe Neto Gravado:\s*(U\$S|\$)\s*([\d.,]+)/i);
  const exchangeRateMatch = flat.match(/Cotizaci[oó]n del D[oó]lar\s*\$\s*([\d.,]+)/i);
  const currency = netGravadoMatch && netGravadoMatch[1].toUpperCase() === 'U$S' ? 'USD' : 'ARS';

  const pointOfSale = numberMatch ? numberMatch[1] : '';
  const documentNumber = numberMatch ? numberMatch[2].slice(-5).padStart(5, '0') : '';
  const unit = POINT_OF_SALE_UNIT[pointOfSale] || '';

  const items = [];
  let match;
  ITEM_LINE.lastIndex = 0;
  while ((match = ITEM_LINE.exec(clean))) {
    const quantity = toNumber(match[1]);
    const importe = toNumber(match[7]);
    items.push({
      quantity,
      code: match[2],
      description: match[3].trim(),
      listUnitPrice: toNumber(match[4]),
      ivaPercent: toNumber(match[5]),
      bonifPercent: match[6] ? toNumber(match[6]) : 0,
      importe,
      // Precio realmente cobrado por unidad, ya con la bonificación
      // aplicada (si la hubo). Es el que sirve para recordar precios: el de
      // lista no refleja lo que el cliente terminó pagando.
      unitPrice: quantity ? Math.round((importe / quantity) * 100) / 100 : toNumber(match[4]),
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
    documentTypeRejected: detectedNonInvoiceType ? detectedNonInvoiceType[0] : '',
    // Ni siquiera un documento con número y punto de venta válidos cuenta
    // como reconocido si es un Remito/Nota de crédito/Recibo, o si no se
    // pudo leer ningún ítem con importe (mejor avisar que guardar $0).
    recognized: Boolean(pointOfSale && documentNumber && unit && items.length && !detectedNonInvoiceType),
  };
}
