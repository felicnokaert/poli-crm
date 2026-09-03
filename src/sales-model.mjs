export const SALES_UNITS = {
  Poliplast: { rate: 0.03, invoicePoints: ['0006', '0011', '0013', '0016'] },
  Poliocho: { rate: 0.01, invoicePoints: ['0003'] },
};

// Felipe cobra en pesos. Si la factura vino en dólares, la comisión se
// calcula sobre el equivalente en pesos usando el tipo de cambio de la
// propia factura, no sobre el importe en dólares directamente.
export function netAmountInArs(sale) {
  const netAmount = Number(sale?.netAmount || 0);
  if (sale?.currency === 'USD' && Number(sale?.exchangeRate) > 0) {
    return netAmount * Number(sale.exchangeRate);
  }
  return netAmount;
}

export function saleCommission(sale) {
  return netAmountInArs(sale) * (SALES_UNITS[sale?.unit]?.rate || 0);
}

export function blankSale() {
  const now = new Date();
  return {
    id: '',
    date: now.toISOString().slice(0, 10),
    unit: 'Poliplast',
    documentType: 'Factura',
    pointOfSale: '0006',
    documentNumber: '',
    customer: '',
    netAmount: '',
    currency: 'ARS',
    exchangeRate: '',
    notes: '',
    collected: false,
  };
}

export function duplicateSale(sales = [], sale = {}) {
  return sales.find((item) =>
    item.id !== sale.id &&
    item.unit === sale.unit &&
    item.documentType === sale.documentType &&
    String(item.pointOfSale || '') === String(sale.pointOfSale || '') &&
    String(item.documentNumber || '') === String(sale.documentNumber || ''),
  );
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function salesToCsv(sales = []) {
  const columns = [
    ['Fecha', 'date'], ['Unidad', 'unit'], ['Comprobante', 'documentType'],
    ['Punto de venta', 'pointOfSale'], ['Número', 'documentNumber'], ['Cliente', 'customer'],
    ['Importe neto sin IVA', 'netAmount'], ['Moneda', 'currency'], ['Tipo de cambio', 'exchangeRateLabel'],
    ['Importe neto en pesos', 'netAmountArs'], ['Comisión', 'commission'], ['¿Se cobró?', 'collectedLabel'], ['Notas', 'notes'],
  ];
  const lines = [columns.map(([label]) => escapeCsvCell(label)).join(';')];
  for (const sale of sales) {
    const row = {
      ...sale,
      currency: sale.currency || 'ARS',
      exchangeRateLabel: sale.currency === 'USD' ? sale.exchangeRate || '' : '',
      netAmountArs: netAmountInArs(sale),
      commission: saleCommission(sale),
      collectedLabel: sale.collected ? 'Sí' : 'No',
    };
    lines.push(columns.map(([, key]) => escapeCsvCell(row[key])).join(';'));
  }
  return `﻿${lines.join('\r\n')}`;
}

export function normalizedSale(sale) {
  const pointOfSale = sale.documentType === 'Factura'
    ? String(sale.pointOfSale || '').padStart(4, '0')
    : '';
  return {
    ...sale,
    pointOfSale,
    documentNumber: String(sale.documentNumber || '').padStart(5, '0'),
    netAmount: Number(sale.netAmount || 0),
    currency: sale.currency === 'USD' ? 'USD' : 'ARS',
    exchangeRate: sale.currency === 'USD' ? Number(sale.exchangeRate || 0) : 0,
    commission: saleCommission(sale),
    collected: Boolean(sale.collected),
  };
}
