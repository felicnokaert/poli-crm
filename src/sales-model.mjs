export const SALES_UNITS = {
  Poliplast: { rate: 0.03, invoicePoints: ['0006', '0011', '0013', '0016'] },
  Poliocho: { rate: 0.01, invoicePoints: ['0003'] },
};

// Unidades por defecto para un workspace nuevo (editables por el usuario en
// Ventas > Objetivos - CUIT, razón social, nombre fantasía, comisión y
// puntos de venta). El formulario guarda la comisión como porcentaje
// (ej: 3), acá se guarda como fracción para no repetir la cuenta en cada
// cálculo.
export function defaultBusinessUnits() {
  return Object.entries(SALES_UNITS).map(([name, unit]) => ({
    id: name,
    name,
    legalName: '',
    cuit: '',
    ratePct: unit.rate * 100,
    invoicePoints: [...unit.invoicePoints],
  }));
}

// Convierte la lista editable de unidades a la forma {nombre: {rate, invoicePoints}}
// que usan saleCommission/normalizedSale. Los workspaces creados antes de
// incorporar esta configuracion llegan con una lista vacia: en ese caso deben
// seguir pudiendo registrar ventas con las dos unidades historicas.
// Invierte el mapa de unidades a {puntoDeVenta: nombreDeUnidad} para que el
// importador de PDF pueda reconocer una unidad de negocio nueva sin tener
// que hardcodear su punto de venta en invoice-parser.mjs.
export function pointOfSaleMapFrom(units = {}) {
  const map = {};
  for (const [name, unit] of Object.entries(units)) {
    for (const point of unit?.invoicePoints || []) {
      if (point) map[point] = name;
    }
  }
  return map;
}

export function unitsMapFrom(businessUnits) {
  const source = Array.isArray(businessUnits) && businessUnits.length
    ? businessUnits
    : defaultBusinessUnits();
  const map = {};
  for (const unit of source) {
    if (!unit?.name) continue;
    map[unit.name] = {
      rate: (Number(unit.ratePct) || 0) / 100,
      invoicePoints: unit.invoicePoints?.length ? unit.invoicePoints : [''],
    };
  }
  return map;
}

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

export function saleCommission(sale, units = SALES_UNITS) {
  // Los workspaces creados antes de que existiera la configuracion de
  // unidades pueden tener businessUnits=[] aun cuando ya contienen ventas.
  // Para las dos unidades historicas conservamos las tasas oficiales; una
  // configuracion explicita sigue teniendo prioridad.
  const rate = units?.[sale?.unit]?.rate ?? SALES_UNITS[sale?.unit]?.rate ?? 0;
  return netAmountInArs(sale) * rate;
}

// Casi todo se vende en dólares; una venta en pesos no trae su propio tipo
// de cambio (no es una factura en USD), así que para sumarla a un objetivo
// en dólares hace falta un tipo de cambio de referencia que el usuario
// define en el objetivo mismo (fallbackRate).
export function netAmountInUsd(sale, fallbackRate) {
  const netAmount = Number(sale?.netAmount || 0);
  if (sale?.currency === 'USD') return netAmount;
  if (Number(fallbackRate) > 0) return netAmount / Number(fallbackRate);
  return 0;
}

export function blankSale(defaultUnit = 'Poliplast', defaultPointOfSale = '0006') {
  const now = new Date();
  return {
    id: '',
    date: now.toISOString().slice(0, 10),
    unit: defaultUnit,
    documentType: 'Factura',
    pointOfSale: defaultPointOfSale,
    documentNumber: '',
    customer: '',
    family: '',
    netAmount: '',
    currency: 'ARS',
    exchangeRate: '',
    notes: '',
    collected: false,
  };
}

export function quarterKey(dateStr = '') {
  const month = Number(String(dateStr).slice(5, 7));
  const year = String(dateStr).slice(0, 4);
  if (!year || !month) return '';
  return `${year}-Q${Math.ceil(month / 3)}`;
}

export const GOAL_METRICS = {
  count: { label: 'Cantidad de ventas', format: (value) => String(Math.round(value)) },
  netArs: { label: 'Neto en pesos', format: (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value || 0) },
  netUsd: { label: 'Neto en dólares', format: (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0) },
  commission: { label: 'Comisión (en pesos)', format: (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value || 0) },
};

// Un objetivo puede ser por cantidad, por monto o por comisión, filtrado
// opcionalmente por unidad y/o punto de venta - "el parámetro que nosotros
// decidamos", como pidió Felipe, en vez de una sola métrica fija.
export function goalPeriodValue(goal, sale) {
  return goal.periodType === 'quarter' ? quarterKey(sale.date) : monthKeyOf(sale.date);
}

function monthKeyOf(date = '') {
  return String(date || '').slice(0, 7);
}

export function computeGoalProgress(sales = [], goal, units = SALES_UNITS) {
  const matching = sales.filter((sale) =>
    goalPeriodValue(goal, sale) === goal.period &&
    (goal.unit === 'Todas' || !goal.unit || sale.unit === goal.unit) &&
    (goal.pointOfSale === 'Todas' || !goal.pointOfSale || sale.pointOfSale === goal.pointOfSale) &&
    (goal.family === 'Todas' || !goal.family || sale.family === goal.family),
  );
  if (goal.metric === 'netArs') return matching.reduce((sum, sale) => sum + netAmountInArs(sale), 0);
  if (goal.metric === 'netUsd') return matching.reduce((sum, sale) => sum + netAmountInUsd(sale, goal.fallbackRate), 0);
  if (goal.metric === 'commission') return matching.reduce((sum, sale) => sum + saleCommission(sale, units), 0);
  return matching.length;
}

export function duplicateSale(sales = [], sale = {}) {
  const pointOfSale = sale.documentType === 'Factura'
    ? String(sale.pointOfSale || '').padStart(4, '0')
    : '';
  const documentNumber = String(sale.documentNumber || '').padStart(5, '0');
  return sales.find((item) =>
    item.id !== sale.id &&
    item.unit === sale.unit &&
    item.documentType === sale.documentType &&
    (item.documentType === 'Factura' ? String(item.pointOfSale || '').padStart(4, '0') : '') === pointOfSale &&
    String(item.documentNumber || '').padStart(5, '0') === documentNumber,
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

export function normalizedSale(sale, units = SALES_UNITS) {
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
    commission: saleCommission(sale, units),
    collected: Boolean(sale.collected),
  };
}
