// Poliplast App (26/11, Felipe: «que deje de haber preguntas de "¿tenemos stock de…?": que vean todo en la app; si aparece es
// porque está, si no es porque algo pasó y Diego lo ajusta»). Primera etapa, solo LECTURA de la app de conteo:
//  - último conteo de cada producto en cada depósito (kv_store log:<dep>:<contador>:<día>, cada renglón con cant, unidad y
//    cap = cuánto trae cada unidad, ej. tambor = 220 kg);
//  - menos lo que se DOSIFICÓ desde ese conteo (dosif_planillas + dosif_lineas: kits × cantidad → kilos de cada componente).
// Las ventas (Mercado Libre, Shopify, remitos de Entregas) se restan en la etapa 2: hace falta acordar con Diego el cruce por SKU.

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

// Stock estimado = último conteo − lo dosificado después de ese conteo en el mismo depósito.
export function stockNow(counts = [], moves = []) {
  return counts.map((count) => {
    const used = moves.filter((move) => move.sku === count.sku && plainDepot(move.depot) === plainDepot(count.depot) && move.at > count.at);
    const usedKg = used.reduce((sum, move) => sum + move.kg, 0);
    const kgNow = count.kg == null ? null : Math.max(0, Math.round((count.kg - usedKg) * 100) / 100);
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
