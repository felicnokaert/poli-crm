// Cotizar el sistema de poliurea Krypton en el asistente (23/10, Felipe: "algún comercial dice: quiero cotizar 200 m2
// de un kit con top, sin top, solo imprimante o solo poliurea, y que sepa qué responder: una idea de los kg que va a
// usar y otra columna con el kit cerrado"). La lógica sale de su planilla "Cotizador de Poliurea": consumo por m²
// de cada capa y kits comerciales cerrados (15 kg, 26,5 kg y 22,5 kg), con el redondeo hacia arriba por producto.
// Sin IA ni costo, y sin precios: la planilla parte de costos internos; para el precio se usa el cotizador.
import { plain } from './knowledge-search.mjs';

export const KRYPTON_LAYERS = {
  imprimacion: { key: 'imprimacion', name: 'Imprimación GC (epoxi)', step: '1° Primer', kgPerM2: 0.2, kitKg: 15, parts: 'A 11,7 kg + B 3,3 kg' },
  poliurea: { key: 'poliurea', name: 'Cold Poliurea', step: '2° Poliurea', kgPerM2: 1.76, kitKg: 26.5, parts: 'A 25 kg + B 1,5 kg' },
  top: { key: 'top', name: 'Impermax Aqua (top, protección UV)', step: '3° Top', kgPerM2: 0.7, kitKg: 22.5, parts: 'monocomponente' },
};

// Kits chicos ya armados (hoja "kit con top" de la planilla): 5, 10 y 15 m².
export const SMALL_KITS = [
  { m2: 5, imprimacion: 1, poliurea: 8.8, top: 3.5 },
  { m2: 10, imprimacion: 2, poliurea: 17.6, top: 7 },
  { m2: 15, imprimacion: 3, poliurea: 26.5, top: 10.5 },
];

const SYSTEMS = {
  con_top: { label: 'Sistema completo con top (imprimación + poliurea + Impermax Aqua)', layers: ['imprimacion', 'poliurea', 'top'] },
  sin_top: { label: 'Sistema sin top (imprimación + poliurea)', layers: ['imprimacion', 'poliurea'] },
  imprimacion: { label: 'Solo imprimación', layers: ['imprimacion'] },
  poliurea: { label: 'Solo poliurea', layers: ['poliurea'] },
  top: { label: 'Solo top (Impermax Aqua)', layers: ['top'] },
};

const AREA = /(\d+(?:[.,]\d+)?)\s*(?:m\s?[2²]|mts?\.?\s?2|mt\s?2|metros?(?:\s+cuadrados?)?|m\s+cuadrados?)(?![a-z0-9])/;
const PRODUCT = /\b(poliurea|krypton|impermax|imprimant\w*|imprimaci\w*|primer|(?:con|sin)\s+top)\b/;
const QUOTE = /\b(cotiz\w*|presupuest\w*|kit|kits|kilos|kg|material\w*|necesit\w*|cuanto\w*|cuantos|calcul\w*|llevo|llevar|sistema)\b/;
const ONLY = /\b(?:solo|solamente|unicamente|nada mas que)\s+(?:la\s+|el\s+|de\s+|con\s+)?(imprimant\w*|imprimaci\w*|primer|poliurea|cold|top|impermax)/;

export const asksKrypton = (query) => {
  const text = plain(query);
  return AREA.test(text) && PRODUCT.test(text) && QUOTE.test(text);
};

// "200 m2 con top" → { m2: 200, system: 'con_top', explicit: true }
export function parseKryptonAsk(query) {
  if (!asksKrypton(query)) return null;
  const text = plain(query);
  const m2 = Number(AREA.exec(text)[1].replace(',', '.'));
  if (!(m2 > 0) || m2 > 100000) return null;
  const only = ONLY.exec(text)?.[1];
  if (only) {
    const system = /^(imprimant|imprimaci|primer)/.test(only) ? 'imprimacion' : /^(top|impermax)/.test(only) ? 'top' : 'poliurea';
    return { m2, system, explicit: true };
  }
  if (/\bsin\s+(top|proteccion|impermax|uv)\b/.test(text)) return { m2, system: 'sin_top', explicit: true };
  if (/\b(con\s+(top|proteccion|impermax|uv)|completo|sistema completo|las 3 capas|tres capas)\b/.test(text)) return { m2, system: 'con_top', explicit: true };
  return { m2, system: 'con_top', explicit: false };
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const ceilKits = (value) => Math.ceil(round(value, 6));
const fmt = (value) => round(value, 2).toLocaleString('es-AR', { maximumFractionDigits: 2 });

export function kryptonQuote({ m2, system = 'con_top' }) {
  const config = SYSTEMS[system] || SYSTEMS.con_top;
  const small = m2 <= 15 ? SMALL_KITS.find((kit) => kit.m2 >= m2) : null;
  const rows = config.layers.map((key) => {
    const layer = KRYPTON_LAYERS[key];
    const kgToUse = round(m2 * layer.kgPerM2, 2);
    // Hasta 15 m² hay kits chicos ya armados; de ahí en adelante, kits comerciales de 15, 26,5 y 22,5 kg.
    const kits = small ? 1 : ceilKits(kgToUse / layer.kitKg);
    const closedKg = small ? small[key] : round(kits * layer.kitKg, 2);
    return {
      key, name: layer.name, step: layer.step, parts: small ? '' : layer.parts,
      kgToUse, kitLabel: small ? `kit de ${small.m2} m² (${fmt(closedKg)} kg)` : `${kits} ${kits === 1 ? 'kit' : 'kits'} de ${fmt(layer.kitKg)} kg`,
      kits, closedKg, leftoverKg: round(closedKg - kgToUse, 2), coversM2: round(closedKg / layer.kgPerM2, 1),
    };
  });
  return {
    m2, system, label: config.label, rows, small: Boolean(small), smallM2: small?.m2 || 0,
    totalKgToUse: round(rows.reduce((sum, row) => sum + row.kgToUse, 0), 2),
    totalClosedKg: round(rows.reduce((sum, row) => sum + row.closedKg, 0), 2),
    // Con esos kits, hasta cuántos m² se llega con TODAS las capas (la que menos rinde manda).
    coversM2: Math.floor(Math.min(...rows.map((row) => row.coversM2))),
  };
}

export const kryptonFor = (query) => {
  const ask = parseKryptonAsk(query);
  return ask ? { ...kryptonQuote(ask), explicit: ask.explicit } : null;
};

// Texto corto de recomendación, solo con lo que sale de la cuenta.
export function kryptonAdvice(quote) {
  const lines = [];
  if (quote.small) lines.push(`Hasta 15 m² hay kits chicos armados de 5, 10 y 15 m²: para ${fmt(quote.m2)} m² corresponde el kit de ${quote.smallM2} m².`);
  else lines.push(`Con esos kits se cubren hasta ${quote.coversM2} m² con todas las capas${quote.coversM2 > quote.m2 ? `, o sea unos ${Math.floor(quote.coversM2 - quote.m2)} m² más de los pedidos sin comprar otro kit` : ''}.`);
  const waste = quote.rows.filter((row) => row.kitLabel && row.leftoverKg > 0 && !quote.small).sort((a, b) => b.leftoverKg - a.leftoverKg)[0];
  if (waste && waste.leftoverKg >= waste.closedKg * 0.3) lines.push(`Sobra bastante de ${waste.name}: ${fmt(waste.leftoverKg)} kg de ${fmt(waste.closedKg)} kg. Si la obra puede crecer unos m², se aprovecha mejor.`);
  if (quote.system === 'con_top') lines.push('El top (Impermax Aqua) es la protección UV de la última capa; sin top el sistema queda con imprimación + poliurea.');
  return lines;
}

export function kryptonContext(quote) {
  if (!quote) return '';
  const rows = quote.rows.map((row) => `- ${row.step} ${row.name}: usar ${fmt(row.kgToUse)} kg (${fmt(row.kgToUse / quote.m2)} kg/m²) → kit cerrado: ${row.kitLabel}, ${fmt(row.closedKg)} kg en total, sobran ${fmt(row.leftoverKg)} kg`);
  return [
    `COTIZACIÓN DE POLIUREA KRYPTON (cuenta hecha con la planilla "Cotizador de Poliurea"): ${fmt(quote.m2)} m², ${quote.label}.${quote.explicit ? '' : ' (El comercial no aclaró si lleva top: se calculó con top; ofrecé también sin top.)'}`,
    ...rows,
    `Total: ${fmt(quote.totalKgToUse)} kg a usar, ${fmt(quote.totalClosedKg)} kg en kits cerrados.`,
    ...kryptonAdvice(quote).map((line) => `- ${line}`),
    'Respondé con dos columnas por producto: kg a usar y kit cerrado. No inventes precios: el precio se arma en el cotizador.',
  ].join('\n');
}
