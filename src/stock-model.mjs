// Poliplast App (26/11, Felipe: «que deje de haber preguntas de "¿tenemos stock de…?": que vean todo en la app; si aparece es
// porque está, si no es porque algo pasó y Diego lo ajusta»). Primera etapa, solo LECTURA de la app de conteo:
//  - último conteo de cada producto en cada depósito (kv_store log:<dep>:<contador>:<día>, cada renglón con cant, unidad y
//    cap = cuánto trae cada unidad, ej. tambor = 220 kg);
//  - menos lo que se DOSIFICÓ desde ese conteo (dosif_planillas + dosif_lineas: kits × cantidad → kilos de cada componente).
// Las ventas se restan cuando Diego lo defina. Regla de Contabilium (Felipe 27/11): la mercadería se descuenta con la VENTA,
// no con el remito: FC y COT restan; NC y NCOT (notas de crédito) suman. El remito es papel y no siempre se hace.

// «20/11/2026» + «09:13» → «2026-11-20T09:13»
export function stamp(fecha = '', hora = '') {
  const [day, month, year] = String(fecha).split('/').map(Number);
  if (!year) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hora || '00:00').padStart(5, '0')}`;
}

const num = (value) => (value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value));
const KG_UNITS = /^(kilo|kg|kilos)$/i;

// logs: [{ key, value: [renglones] }] → último conteo por depósito y SKU.
export function latestCounts(logs = []) {
  const latest = new Map();
  for (const log of logs) {
    for (const row of Array.isArray(log.value) ? log.value : []) {
      if (!row?.sku || row.cant == null || row.cant === '') continue;
      const at = stamp(row.fecha, row.hora);
      const key = `${row.depId}|${row.sku}`;
      const current = latest.get(key);
      if (current && current.at >= at) continue;
      const cap = num(row.cap);
      const cant = Number(row.cant) || 0;
      // Kilos: si la unidad ya es kilo, la cantidad; si es un envase con capacidad (tambor 220), cantidad × capacidad.
      const kg = KG_UNITS.test(String(row.unidad || '')) ? cant : cap ? cant * cap : null;
      latest.set(key, { sku: row.sku, name: row.nombre || row.sku, depId: row.depId, depot: row.depNombre || row.depId, category: row.catNombre || '', unit: row.unidad || '', cap, count: cant, kg, at, by: row.contador || '' });
    }
  }
  return [...latest.values()];
}

// Kilos dosificados por depósito y SKU de componente, desde una fecha (planillas con fecha y depósito).
export function dosifiedSince(planillas = [], lineas = []) {
  const byPlanilla = new Map(planillas.map((planilla) => [planilla.id, planilla]));
  const out = [];
  for (const linea of lineas) {
    const planilla = byPlanilla.get(linea.planilla_id);
    if (!planilla) continue;
    const at = `${planilla.fecha}T${String(planilla.hora || '00:00').slice(0, 5)}`;
    for (const component of Array.isArray(linea.componentes) ? linea.componentes : []) {
      const kg = num(component.kg ?? component.cant ?? component.qty);
      if (!component?.sku || !kg) continue;
      out.push({ sku: component.sku, depot: planilla.deposito || '', at, kg: kg * (Number(linea.cantidad) || 0), kit: linea.sku });
    }
  }
  return out;
}

const plainDepot = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Diego (27/11): al dosificar se separa un tambor y ese tambor ya no se cuenta (se cuenta por tambor cerrado), así que lo
// dosificado NO se resta del conteo: kgNow = lo contado. usedKg queda solo como dato («después se dosificaron N kg»).
export function stockNow(counts = [], moves = [], { subtractDosified = false } = {}) {
  return counts.map((count) => {
    const used = moves.filter((move) => move.sku === count.sku && plainDepot(move.depot) === plainDepot(count.depot) && move.at > count.at);
    const usedKg = used.reduce((sum, move) => sum + move.kg, 0);
    const kgNow = count.kg == null ? null : Math.max(0, Math.round((count.kg - (subtractDosified ? usedKg : 0)) * 100) / 100);
    return { ...count, usedKg: Math.round(usedKg * 100) / 100, kgNow, status: count.count <= 0 ? 'sin' : kgNow != null && count.kg && kgNow / count.kg < 0.2 ? 'poco' : 'hay' };
  });
}

export function daysSince(at = '', now = Date.now()) {
  if (!at) return null;
  return Math.floor((now - Date.parse(`${at}:00-03:00`)) / 86400000);
}

export function searchStock(rows = [], query = '') {
  const words = String(query).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((row) => {
    const text = `${row.sku} ${row.name} ${row.category}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// Depósitos que ya no se usan (Felipe 27/11: Berazategui es el depósito viejo; se mudaron a Villa Domínico).
export const OLD_DEPOT = /berazategui/i;
export const isOldDepot = (depot) => OLD_DEPOT.test(String(depot || ''));
export const depotLabel = (depot) => (isOldDepot(depot) ? `${depot} (depósito viejo)` : depot);

// Una sola hoja (Felipe 27/11): una fila por producto con el stock de cada depósito (conteo) y el de Contabilium.
// Berazategui (depósito viejo) no es columna: queda en `old` por si se quiere ver aparte.
export function depotSlot(name = '') {
  const text = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/berazategui/.test(text)) return 'old';
  if (/dominico|\bvd\b/.test(text)) return 'vd';
  if (/mar del plata|\bmdq\b|\bmdp\b/.test(text)) return 'mdq';
  return 'other';
}

const normCode = (code = '') => String(code).trim().toUpperCase().replace(/\s+/g, '');

// contabilium: { companies: { POLIPLAST: { items: { CODIGO: { n, t, d: { vd, mdq } } } } } } → mapa CODIGO → { vd, mdq, total }.
export function contabiliumByCode(detail = {}) {
  const out = new Map();
  for (const company of Object.values(detail?.companies || {})) {
    for (const [code, item] of Object.entries(company?.items || {})) {
      const current = out.get(normCode(code)) || { vd: null, mdq: null, total: null };
      const depots = item?.d || {};
      const add = (a, b) => (b == null ? a : (a || 0) + Number(b));
      out.set(normCode(code), { vd: add(current.vd, depots.vd), mdq: add(current.mdq, depots.mdq), total: add(current.total, item?.t) });
    }
  }
  // El Excel del reporte de stock (por depósito) manda sobre lo de la API, que solo trae el total.
  for (const [code, item] of Object.entries(detail?.excel?.items || {})) {
    const d = item?.d || {};
    out.set(normCode(code), { vd: d.vd ?? 0, mdq: d.mdq ?? 0, full: d.full ?? null, carr: d.carr ?? null, total: item?.t ?? null, excel: true });
  }
  return out;
}

// rows = stockNow(...) (una fila por depósito y SKU) → una fila por producto.
export function pivotStock(rows = [], contabilium = new Map()) {
  const bySku = new Map();
  for (const row of rows) {
    const product = bySku.get(row.sku) || { sku: row.sku, name: row.name, category: row.category, vd: null, mdq: null, old: null, other: [] };
    const slot = depotSlot(row.depot);
    if (slot === 'other') product.other.push(row);
    else if (!product[slot] || product[slot].at < row.at) product[slot] = row;
    if (row.name && row.name !== row.sku) product.name = row.name;
    if (row.category) product.category = row.category;
    bySku.set(row.sku, product);
  }
  return [...bySku.values()].map((product) => {
    const cb = contabilium.get(normCode(product.sku)) || null;
    const live = [product.vd, product.mdq].filter(Boolean);
    const status = !live.length ? 'sin-conteo' : live.every((cell) => cell.status === 'sin') ? 'sin' : live.some((cell) => cell.status === 'hay') ? 'hay' : 'poco';
    return { ...product, cbVd: cb?.vd ?? null, cbMdq: cb?.mdq ?? null, cbFull: cb?.full ?? null, cbCarr: cb?.carr ?? null, cbTotal: cb?.total ?? null, status };
  });
}

// Texto del ícono «i»: quién contó y cuándo (el último conteo).
export function countInfo(cell, now = Date.now()) {
  if (!cell) return 'Sin conteo en este depósito.';
  const [day, time] = String(cell.at || '').split('T');
  const date = day ? day.split('-').reverse().join('/') : '';
  const days = daysSince(cell.at, now);
  return `Último conteo: ${cell.by || 'sin nombre'}, el ${date}${time ? ` a las ${time}` : ''}${days != null ? ` (hace ${days} ${days === 1 ? 'día' : 'días'})` : ''}.${cell.usedKg ? ` Después se dosificaron ${cell.usedKg} kg (de un tambor abierto, que no entra en el conteo).` : ''}`;
}
