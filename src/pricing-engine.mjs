// Motor de precios (27/11, idea de Juan: «Diego carga costos y con los parámetros de la empresa —orden de remarcación,
// cantidades— ponés CUIT, cantidad y te arroja el precio»). Lógica pura, la usan la pantalla y el servidor.
// Orden: costo → × (1 + margen de la familia/marca) → × ajuste por tipo de cliente → × tramo por cantidad
// → × forma de pago → redondeo. Todo en USD NETO (sin IVA); el IVA se suma al final para mostrar el importe final.
// Los valores de fábrica son DE EJEMPLO («a confirmar con Juan»): se cambian en Precios y condiciones → Motor de precios.

export const CLIENT_TYPES = [
  { id: 'consumidor', label: 'Consumidor final' },
  { id: 'aplicador', label: 'Aplicador / usa el producto' },
  { id: 'revendedor', label: 'Revendedor' },
  { id: 'distribuidor', label: 'Distribuidor' },
];

export const DEFAULT_PARAMS = {
  example: true, // se apaga cuando alguien guarda parámetros propios
  defaultMargin: 60,
  margins: [ // por familia o marca (lo que coincida primero en el nombre de la familia, la marca o el producto)
    { match: 'poliuretano', margin: 45 },
    { match: 'resinplast', margin: 70 },
    { match: 'penosil', margin: 40 },
    { match: 'purmac', margin: 35 },
  ],
  clientAdjust: { consumidor: 0, aplicador: -5, revendedor: -12, distribuidor: -20 },
  tiers: [ // desde N unidades, % de descuento
    { from: 1, percent: 0 },
    { from: 10, percent: 3 },
    { from: 50, percent: 6 },
    { from: 200, percent: 10 },
  ],
  rounding: 0.5, // múltiplo en USD al que se redondea hacia arriba (0 = sin redondeo)
  vat: 21,
};

const num = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const plain = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const normSku = (sku) => String(sku || '').trim().toUpperCase().replace(/\s+/g, '');
export const normCuit = (cuit) => String(cuit || '').replace(/\D/g, '');

// Junta lo guardado con los valores de fábrica y limpia lo raro (porcentajes fuera de rango, tramos desordenados).
export function cleanParams(input = {}) {
  const base = { ...DEFAULT_PARAMS, ...(input || {}) };
  const clamp = (value, min, max, fallback) => { const n = num(value); return n === null ? fallback : Math.min(max, Math.max(min, n)); };
  const margins = (Array.isArray(base.margins) ? base.margins : [])
    .map((row) => ({ match: String(row?.match || '').trim().slice(0, 60), margin: clamp(row?.margin, -50, 500, 0) }))
    .filter((row) => row.match);
  const clientAdjust = {};
  for (const type of CLIENT_TYPES) clientAdjust[type.id] = clamp(base.clientAdjust?.[type.id], -60, 100, DEFAULT_PARAMS.clientAdjust[type.id]);
  const tiers = (Array.isArray(base.tiers) ? base.tiers : [])
    .map((row) => ({ from: Math.max(1, Math.round(clamp(row?.from, 1, 1e6, 1))), percent: clamp(row?.percent, 0, 80, 0) }))
    .sort((a, b) => a.from - b.from)
    .filter((row, index, all) => index === 0 || row.from !== all[index - 1].from);
  return {
    example: input?.example === undefined ? true : Boolean(input.example),
    defaultMargin: clamp(base.defaultMargin, -50, 500, DEFAULT_PARAMS.defaultMargin),
    margins,
    clientAdjust,
    tiers: tiers.length ? tiers : [{ from: 1, percent: 0 }],
    rounding: clamp(base.rounding, 0, 1000, 0),
    vat: clamp(base.vat, 0, 50, 21),
  };
}

export function marginFor(params, product = {}) {
  const text = plain([product.family, product.subfamily, product.brand, product.name].filter(Boolean).join(' '));
  const hit = params.margins.find((row) => text.includes(plain(row.match)));
  return hit ? { margin: hit.margin, why: `familia/marca «${hit.match}»` } : { margin: params.defaultMargin, why: 'margen general' };
}

export function tierFor(params, quantity) {
  const qty = Math.max(1, num(quantity) || 1);
  return [...params.tiers].reverse().find((row) => qty >= row.from) || { from: 1, percent: 0 };
}

// payment: fila de payment_policies (discount_percent / surcharge_percent), la misma que usa la cotización.
export function paymentFactor(payment) {
  if (!payment) return { factor: 1, label: 'sin forma de pago' };
  const discount = num(payment.discount_percent) || 0;
  const surcharge = num(payment.surcharge_percent) || 0;
  return { factor: (1 - discount / 100) * (1 + surcharge / 100), label: payment.name || 'forma de pago', discount, surcharge };
}

export function roundUp(value, step) {
  if (!(step > 0)) return Math.round(value * 100 + 1e-6) / 100;
  return Math.ceil(value / step - 1e-9) * step;
}

// Calcula el precio por unidad. Devuelve { error } si falta el costo.
export function computePrice({ cost, product = {}, clientType = 'consumidor', quantity = 1, payment = null, params: rawParams } = {}) {
  const params = cleanParams(rawParams);
  const base = num(cost);
  if (!(base > 0)) return { error: 'Falta el costo de este producto (lo carga Diego en «Costos»).' };
  const steps = [{ label: 'Costo (USD + IVA)', factor: null, value: base }];
  let value = base;
  const { margin, why } = marginFor(params, product);
  value *= 1 + margin / 100;
  steps.push({ label: `Margen ${margin} % (${why})`, factor: 1 + margin / 100, value });
  const type = CLIENT_TYPES.find((row) => row.id === clientType) || CLIENT_TYPES[0];
  const adjust = params.clientAdjust[type.id] || 0;
  value *= 1 + adjust / 100;
  steps.push({ label: `${type.label}: ${adjust > 0 ? '+' : ''}${adjust} %`, factor: 1 + adjust / 100, value });
  const tier = tierFor(params, quantity);
  value *= 1 - tier.percent / 100;
  steps.push({ label: `Cantidad ${Math.max(1, num(quantity) || 1)} (tramo desde ${tier.from}): −${tier.percent} %`, factor: 1 - tier.percent / 100, value });
  const pay = paymentFactor(payment);
  value *= pay.factor;
  steps.push({ label: `Forma de pago: ${pay.label}${pay.discount ? ` −${pay.discount} %` : ''}${pay.surcharge ? ` +${pay.surcharge} %` : ''}`, factor: pay.factor, value });
  const net = roundUp(value, params.rounding);
  if (params.rounding > 0) steps.push({ label: `Redondeo a múltiplos de USD ${params.rounding}`, factor: null, value: net });
  const gross = Math.round(net * (1 + params.vat / 100) * 100) / 100;
  const qty = Math.max(1, num(quantity) || 1);
  return {
    net, gross, vat: params.vat, quantity: qty,
    totalNet: Math.round(net * qty * 100) / 100,
    totalGross: Math.round(gross * qty * 100) / 100,
    markupOverCost: Math.round((net / base - 1) * 1000) / 10,
    steps, example: params.example,
  };
}

// Tipo de cliente a partir de la ficha del CRM (o lo que se encuentre por CUIT). Si no se puede saber, null.
export function clientTypeFrom(client = {}) {
  const manual = String(client.tipoCliente || '');
  if (['aplicador', 'inyeccion', 'fabricante'].includes(manual)) return 'aplicador';
  const text = plain([client.sourceType, client.rubro, client.category, client.segment, client.type, client.name].filter(Boolean).join(' '));
  if (/distribuid/.test(text)) return 'distribuidor';
  if (/revend|ferreter|corralon|pintureria|comercio|mayorista/.test(text)) return 'revendedor';
  if (/aplicador|fabric|taller|industria|inyecc/.test(text)) return 'aplicador';
  if (/consumidor|particular/.test(text)) return 'consumidor';
  return null;
}

export function findClientByCuit(clients = [], cuit) {
  const key = normCuit(cuit);
  if (key.length < 8) return null;
  return clients.find((client) => normCuit(client.cuit) === key) || null;
}

// Costos guardados: { SKU: { usd, by, at } }. Limpia y valida una carga (una o varias filas «SKU;costo» pegadas).
export function parseCostPaste(text = '') {
  const rows = [];
  const errors = [];
  for (const line of String(text).split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) continue;
    const parts = clean.split(/[;\t|]+|\s{2,}/).map((part) => part.trim()).filter(Boolean);
    const sku = normSku(parts[0]);
    const usd = num(String(parts[parts.length - 1] || '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, ''));
    if (!sku || parts.length < 2 || !(usd > 0)) { errors.push(clean); continue; }
    rows.push({ sku, usd: Math.round(usd * 10000) / 10000 });
  }
  return { rows, errors };
}

export function mergeCosts(stored = {}, rows = [], { who = '', at = '' } = {}) {
  const next = { ...(stored || {}) };
  for (const row of rows) {
    const sku = normSku(row.sku);
    if (!sku) continue;
    if (row.remove) { delete next[sku]; continue; }
    const usd = num(row.usd);
    if (usd > 0) next[sku] = { usd, by: who, at };
  }
  return next;
}

// Precio de lista minorista (USD neto) para comparar con lo que da el motor.
export function compareWithList(result, listRow) {
  if (!result?.net || !(listRow?.net > 0)) return null;
  const ratio = result.net / listRow.net;
  return { listNet: listRow.net, diffPercent: Math.round((ratio - 1) * 1000) / 10 };
}
