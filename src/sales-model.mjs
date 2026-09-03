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
    ['Importe neto sin IVA', 'netAmount'], ['Comisión', 'commission'], ['¿Se cobró?', 'collectedLabel'], ['Notas', 'notes'],
  ];
  const lines = [columns.map(([label]) => escapeCsvCell(label)).join(';')];
  for (const sale of sales) {
    const row = { ...sale, commission: saleCommission(sale), collectedLabel: sale.collected ? 'Sí' : 'No' };
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
    commission: saleCommission(sale),
    collected: Boolean(sale.collected),
  };
}
