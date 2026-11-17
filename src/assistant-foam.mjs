// Cuánto material de poliuretano hace falta para llenar moldes (16/11, Felipe: «sumame al asistente estos cálculos y que vea
// las fichas técnicas»). Caso típico: 1.500 boyas de 2 m³, densidad moldeada 38 kg/m³, juego de 470 kg (220 poliol + 250 iso).
//   kg de mezcla = volumen × densidad moldeada   ·   se reparte por la relación de mezcla de la ficha (ej. 100 : 110 en peso)
//   juegos = el componente que se acaba primero manda (cada tambor tiene SU cantidad), más un margen de pérdidas.
// Sin IA ni costo, y sin precios. Todo lo que no sale de la pregunta ni de la ficha se pregunta, no se inventa.
import { plain } from './knowledge-search.mjs';

const NUM = '(\\d+(?:[.,]\\d+)?)';
const num = (value) => { const text = String(value).trim(); return Number(/^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text.replace(',', '.')); };

const COUNT = new RegExp(`(\\d[\\d.]*)\\s*(?:boyas?|piezas?|unidades?|moldes?|paneles?|bloques?|heladeras?|tanques?|tablas?|cascos?|cajones?|colchones?|veces)\\b`);
const VOLUME = new RegExp(`${NUM}\\s*(m\\s?3|m³|mt\\s?3|metros?\\s+cubicos?|litros?|lts?|dm\\s?3|l)(?![a-z0-9])`);
const DENSITY = new RegExp(`(?:densidad[^\\d]{0,40}${NUM}|${NUM}\\s*kg\\s*(?:/|x|por)?\\s*m\\s?3)`);
const MATERIAL = /\b(material\w*|necesit\w*|cuanto\w*|calcul\w*|kilos|kg|conjunt\w*|juegos?|kits?|tambor\w*|llevar|llevo)\b/;
const FOAM_WORDS = /\b(densidad|moldead\w*|inyecc\w*|boyas?|espuma|poliuretano|poliol|isocian\w*|iso|isobunker|molde\w*|rellen\w*)\b/;
const PRICE = /\b(precio|cuesta|sale|valor|cotiz\w*|presupuest\w*)\b/;

export function parseFoamAsk(query) {
  const text = plain(query);
  if (PRICE.test(text) || !MATERIAL.test(text) || !FOAM_WORDS.test(text)) return null;
  const volumeMatch = VOLUME.exec(text.replace(/(\d)\s+(m\s?3)/g, '$1$2'));
  if (!volumeMatch) return null;
  const unit = volumeMatch[2].replace(/\s/g, '');
  let volumeM3 = num(volumeMatch[1]);
  if (/^(l|lt|lts|litro|litros|dm3)$/.test(unit)) volumeM3 /= 1000;
  if (!(volumeM3 > 0)) return null;
  const countMatch = COUNT.exec(text);
  const count = countMatch ? Math.round(num(countMatch[1])) : 1;
  if (!(count >= 1) || count > 1000000) return null;
  const densityMatch = DENSITY.exec(text);
  const density = densityMatch ? num(densityMatch[1] || densityMatch[2]) : null;
  const poliol = new RegExp(`${NUM}\\s*(?:kg\\s*)?(?:de\\s+)?poliol`).exec(text);
  const iso = new RegExp(`${NUM}\\s*(?:kg\\s*)?(?:de\\s+)?(?:isocian\\w*|iso)\\b`).exec(text);
  const kit = poliol && iso ? { poliol: num(poliol[1]), iso: num(iso[1]) } : null;
  const loss = /perdid\w*\s*(?:de(?:l)?\s*)?(\d+(?:[.,]\d+)?)\s*%?|(\d+(?:[.,]\d+)?)\s*%\s*de\s*perdid/.exec(text);
  return {
    count, volumeM3, totalVolumeM3: count * volumeM3, density: density > 0 && density < 2000 ? density : null, kit,
    lossPct: loss ? num(loss[1] || loss[2]) : null, text,
  };
}

// De la ficha técnica: relación de mezcla en peso, densidad moldeada y libre, y tambores.
export function fichaMixData(doc) {
  const raw = String(doc?.extractedText || doc?.extracted_text || '');
  if (!raw) return null;
  const flat = raw.replace(/\s+/g, ' ').replace(/m\s?[3³]/gi, 'm');
  const ratio = /(\d{2,3})\s*:\s*(\d{2,3})\s*(?:gramos|gr\b|g\b|kg|en peso|peso)/i.exec(flat);
  const molded = /Densidad\s+Moldeada[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/i.exec(flat);
  const free = /Densidad\s+Libre[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/i.exec(flat);
  const global = /Densidad\s+Global[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/i.exec(flat);
  const core = /Densidad\s+N[uú]cleo[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/i.exec(flat);
  const drums = [...flat.matchAll(/Tambor\s+Met[aá]lico\s+x\s*(\d+)\s*Kg/gi)].map((m) => Number(m[1]));
  if (!ratio && !molded && !global) return null;
  return {
    title: doc.title || doc.product || 'Ficha técnica',
    ratio: ratio ? { poliol: Number(ratio[1]), iso: Number(ratio[2]) } : null,
    densityMin: molded ? num(molded[1]) : null, densityMax: molded ? num(molded[2]) : null,
    freeMin: free ? num(free[1]) : null, freeMax: free ? num(free[2]) : null,
    globalMin: global ? num(global[1]) : null, globalMax: global ? num(global[2]) : null, coreMin: core ? num(core[1]) : null, coreMax: core ? num(core[2]) : null,
    drumPoliol: drums[0] || null, drumIso: drums[1] || null,
  };
}

// La ficha del producto que nombra la pregunta: coincide por el código o nombre (770-IR, isobunker, poli-plus 618…).
export function pickFoamDoc(query, docs = []) {
  const text = plain(query);
  const words = new Set(text.split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
  let best = null;
  let bestScore = 0;
  for (const doc of docs || []) {
    if (!(doc?.extractedText || doc?.extracted_text)) continue;
    const name = plain(`${doc.title || ''} ${doc.product || ''} ${doc.sku || ''}`);
    const tokens = name.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
    let score = 0;
    for (const token of tokens) if (words.has(token)) score += /\d/.test(token) ? 3 : 1;
    if (score > bestScore) { best = doc; bestScore = score; }
  }
  return bestScore >= 3 && fichaMixData(best) ? best : null;
}

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export function foamQuote(ask, ficha = null) {
  if (!ask) return null;
  const lossPct = ask.lossPct ?? 5;
  const ratio = ficha?.ratio || null;
  const densities = ask.density
    ? [{ value: ask.density, source: 'la que me pasaste' }]
    : ficha?.densityMin ? [{ value: ficha.densityMin, source: 'mínima de la ficha' }, { value: ficha.densityMax, source: 'máxima de la ficha' }] : [];
  const rows = densities.map(({ value, source }) => {
    const perPieceKg = ask.volumeM3 * value;
    const totalKg = perPieceKg * ask.count;
    const withLossKg = totalKg * (1 + lossPct / 100);
    const split = (kg) => (ratio ? { poliol: kg * ratio.poliol / (ratio.poliol + ratio.iso), iso: kg * ratio.iso / (ratio.poliol + ratio.iso) } : null);
    const base = split(totalKg);
    const loss = split(withLossKg);
    let kits = null;
    if (ask.kit && base) {
      const need = (parts) => Math.max(Math.ceil(round(parts.poliol / ask.kit.poliol, 6)), Math.ceil(round(parts.iso / ask.kit.iso, 6)));
      const limiting = (parts) => (parts.poliol / ask.kit.poliol >= parts.iso / ask.kit.iso ? 'poliol' : 'isocianato');
      kits = { exact: need(base), withLoss: need(loss), limiting: limiting(loss), kitKg: ask.kit.poliol + ask.kit.iso,
        leftoverIso: round(need(loss) * ask.kit.iso - loss.iso, 0), leftoverPoliol: round(need(loss) * ask.kit.poliol - loss.poliol, 0) };
    } else if (ask.kit) {
      const kitKg = ask.kit.poliol + ask.kit.iso;
      kits = { exact: Math.ceil(round(totalKg / kitKg, 6)), withLoss: Math.ceil(round(withLossKg / kitKg, 6)), limiting: '', kitKg };
    }
    return { density: value, source, perPieceKg: round(perPieceKg), totalKg: round(totalKg, 0), withLossKg: round(withLossKg, 0), base, loss, kits,
      piecesPerKit: ask.kit ? round((ask.kit.poliol + ask.kit.iso) / perPieceKg) : null };
  });
  const notes = [];
  if (!densities.length) notes.push('Falta la densidad moldeada (kg/m³) y no encontré la ficha del producto: decime el producto o la densidad.');
  if (!ratio && densities.length) notes.push('No tengo la relación de mezcla del producto: decime cuál es (o nombrá el producto) para repartir poliol e isocianato.');
  if (ask.kit && ratio) {
    const kitRatio = ask.kit.iso / ask.kit.poliol * 100;
    const fichaRatio = ratio.iso / ratio.poliol * 100;
    if (Math.abs(kitRatio - fichaRatio) / fichaRatio > 0.02) notes.push(`El juego (${ask.kit.poliol} poliol + ${ask.kit.iso} iso) es 100 : ${round(kitRatio, 1)} y la ficha dice 100 : ${round(fichaRatio, 1)}. Sobra isocianato; confirmá con el área técnica cómo se arma el juego.`);
  }
  if (ficha?.drumPoliol && ask.kit && ask.kit.poliol !== ficha.drumPoliol) notes.push(`La ficha trae tambores de ${ficha.drumPoliol} kg de poliol${ficha.drumIso ? ` y ${ficha.drumIso} kg de iso` : ''}; el juego que pasaste usa ${ask.kit.poliol} kg de poliol.`);
  if (ficha?.densityMin && ask.density && (ask.density < ficha.densityMin || ask.density > ficha.densityMax)) notes.push(`La densidad ${ask.density} kg/m³ está fuera de la moldeada sugerida por la ficha (${ficha.densityMin} a ${ficha.densityMax}).`);
  if (ask.volumeM3 >= 0.5) notes.push('Con piezas de este volumen la espuma rígida genera mucho calor: se suele inyectar por capas. Confirmalo con el Servicio Técnico antes de prometer el trabajo.');
  return { ask, ficha, lossPct, ratio, rows, notes, lossAssumed: ask.lossPct == null };
}

const fmt = (value) => Number(value).toLocaleString('es-AR', { maximumFractionDigits: 1 });
export const foamFor = (query, docs = []) => {
  const ask = parseFoamAsk(query);
  if (!ask) return null;
  const doc = pickFoamDoc(query, docs);
  return foamQuote(ask, doc ? fichaMixData(doc) : null);
};

export function foamContext(quote) {
  if (!quote) return '';
  const { ask, ficha } = quote;
  const lines = [
    `CÁLCULO DE MATERIAL DE POLIURETANO (hecho con la fórmula del CRM, sin IA): ${fmt(ask.count)} pieza(s) de ${fmt(ask.volumeM3)} m³ = ${fmt(ask.totalVolumeM3)} m³ en total.`,
    'Fórmula: kg de mezcla = volumen × densidad moldeada. Se reparte por la relación de mezcla EN PESO de la ficha. Los juegos salen del componente que se acaba primero (cada tambor trae su cantidad), con un margen de pérdidas.',
    ficha ? `Ficha usada: ${ficha.title}${ficha.ratio ? ` · relación ${ficha.ratio.poliol} : ${ficha.ratio.iso} en peso` : ''}${ficha.densityMin ? ` · densidad moldeada sugerida ${ficha.densityMin} a ${ficha.densityMax} kg/m³` : ''}${ficha.drumPoliol ? ` · tambores ${ficha.drumPoliol} kg poliol${ficha.drumIso ? ` / ${ficha.drumIso} kg iso` : ''}` : ''}.` : 'No encontré ficha del producto nombrado.',
  ];
  for (const row of quote.rows) {
    lines.push(`- Densidad ${fmt(row.density)} kg/m³ (${row.source}): ${fmt(row.perPieceKg)} kg por pieza, ${fmt(row.totalKg)} kg en total; con ${quote.lossPct} % de pérdidas ${fmt(row.withLossKg)} kg.`);
    if (row.base) lines.push(`  Poliol ${fmt(row.base.poliol)} kg e isocianato ${fmt(row.base.iso)} kg (con pérdidas: ${fmt(row.loss.poliol)} y ${fmt(row.loss.iso)}).`);
    if (row.kits) lines.push(`  Juegos de ${fmt(row.kits.kitKg)} kg: ${row.kits.exact} sin pérdidas, ${row.kits.withLoss} con ${quote.lossPct} %${row.kits.limiting ? ` (manda el ${row.kits.limiting}; sobran ${fmt(row.kits.leftoverIso)} kg de iso y ${fmt(row.kits.leftoverPoliol)} kg de poliol)` : ''}; ${fmt(row.piecesPerKit)} piezas por juego.`);
  }
  for (const note of quote.notes) lines.push(`- Aviso: ${note}`);
  lines.push('Respondé con esos números tal cual, explicá la fórmula en una línea y marcá los avisos. No inventes datos que no estén en la pregunta ni en la ficha.');
  return lines.join('\n');
}
