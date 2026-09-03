export const SALES_UNITS = {
  Poliplast: { rate: 0.03, invoicePoints: ['0006', '0011', '0013', '0016'] },
  Poliocho: { rate: 0.01, invoicePoints: ['0003'] },
};

export function saleCommission(sale) {
  return Number(sale?.netAmount || 0) * (SALES_UNITS[sale?.unit]?.rate || 0);
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
    notes: '',
  };
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
    commission: saleCommission(sale),
  };
}
