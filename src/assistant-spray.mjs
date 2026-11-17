// Cuánto material de poliuretano SPRAY necesita una obra (17/11, Felipe: «que sepa calcular la cantidad de material para spray»).
// Ejemplo: 1.845 m² de chapa sinusoidal (+10 % por la curvatura), rinde 1,5 kg/m², tambores cerrados 220 poliol + 250 iso (618-SP):
//   superficie real × (1 + extra del sustrato) × consumo por m² = kg de mezcla → se reparte por la relación de la ficha (100 : 110)
//   → sistemas = el componente que primero pide otro tambor (se compra cerrado) → sobrante y hasta cuántos m² cubren.
// El sustrato manda: losa, madera u hormigón no suman nada; la chapa suma 10 % (sinusoidal) y la muy curva 20 a 30 %.
import { plain } from './knowledge-search.mjs';
import { fichaMixData, pickFoamDoc } from './assistant-foam.mjs';

const NUM = '(\\d+(?:[.,]\\d+)?)';
const num = (value) => { const text = String(value).trim(); return Number(/^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text.replace(',', '.')); };

const AREA = new RegExp(`(\\d[\\d.]*(?:,\\d+)?)\\s*(?:m\\s?[2²]|mts?\\.?\\s?2|mt\\s?2|metros?\\s+cuadrados?)(?![a-z0-9])`);
const SPRAY = /\b(spray|proyecta\w*|proyeccion|espuma|aislaci\w*|aislar|aplicar|aplicacion|cubierta|techo|techado|chapa|losa|618|sistemas?|tambor\w*)\b/;
const MATERIAL = /\b(sistemas?|tambor\w*|material\w*|necesit\w*|cuanto\w*|calcul\w*|kilos|kg|llevar|llevo|compra\w*)\b/;
const NOT_SPRAY = /\b(poliurea|krypton|impermax|imprimant\w*|imprimaci\w*|precio|cuesta|sale|valor|cotiz\w*|presupuest\w*|moldes?|boyas?|inyecc\w*)\b/;
const RATE = new RegExp(`(?:rinde|rendimiento|consumo|rinden?)\\D{0,25}${NUM}\\s*(?:kg|kilos?)\\s*(?:/|por|x)?\\s*m\\s?[2²]|${NUM}\\s*(?:kg|kilos?)\\s*(?:/|por|x)\\s*m\\s?[2²]`);
const THICK = new RegExp(`(?:espesor|de)\\s*${NUM}\\s*(mm|milimetros?|cm|centimetros?)`);
const EXTRA = new RegExp(`(?:\\+|mas|extra|incremento|adicional)\\s*(?:de(?:l)?\\s*)?${NUM}\\s*%|${NUM}\\s*%\\s*(?:mas|extra|de mas|por (?:curva|desarrollo))`);

export const SUBSTRATES = [
  { key: 'chapa', test: /\bchapas?\b|\bcinc\b|\bmetalic\w*\b|\bsinusoidal\b|\btrapezoidal\b|\bacanalad\w*\b/, label: 'chapa', extra: 10 },
  { key: 'losa', test: /\b(losa|hormigon|cemento|madera|machimbre|mamposteria|ladrillo|membrana|pared(?:es)?|muro|contrapiso)\b/, label: 'sustrato plano', extra: 0 },
];

export function parseSprayAsk(query) {
  const text = plain(query);
  if (NOT_SPRAY.test(text) || !MATERIAL.test(text) || !SPRAY.test(text)) return null;
  const areaMatch = AREA.exec(text);
  if (!areaMatch) return null;
  const m2 = num(areaMatch[1]);
  if (!(m2 > 0) || m2 > 1000000) return null;
  const substrate = SUBSTRATES.find((item) => item.test.test(text)) || null;
  const extraMatch = EXTRA.exec(text);
  const extraPct = extraMatch ? num(extraMatch[1] || extraMatch[2]) : null;
  const rateMatch = RATE.exec(text);
  const kgPerM2 = rateMatch ? num(rateMatch[1] || rateMatch[2]) : null;
  const thickMatch = kgPerM2 ? null : THICK.exec(text);
  const thicknessMm = thickMatch ? num(thickMatch[1]) * (/^c/.test(thickMatch[2]) ? 10 : 1) : null;
  const dens = /densidad[^\d]{0,30}(\d+(?:[.,]\d+)?)/.exec(text);
  const poliol = new RegExp(`${NUM}\\s*(?:kg\\s*)?(?:de\\s+)?poliol`).exec(text);
  const iso = new RegExp(`${NUM}\\s*(?:kg\\s*)?(?:de\\s+)?(?:isocian\\w*|iso)\\b`).exec(text);
  const loss = /perdid\w*\s*(?:de(?:l)?\s*)?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%\s*de\s*perdid/.exec(text);
  return {
    m2, substrate, extraPct, kgPerM2: kgPerM2 > 0 && kgPerM2 < 20 ? kgPerM2 : null, thicknessMm: thicknessMm > 0 && thicknessMm < 300 ? thicknessMm : null,
    density: dens ? num(dens[1]) : null, drums: poliol && iso ? { poliol: num(poliol[1]), iso: num(iso[1]) } : null, lossPct: loss ? num(loss[1] || loss[2]) : 0,
  };
}

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export function sprayQuote(ask, ficha = null) {
  if (!ask) return null;
  const notes = [];
  const extraPct = ask.extraPct ?? ask.substrate?.extra ?? 0;
  if (!ask.substrate && ask.extraPct == null) notes.push('No dijiste el sustrato. Lo calculé sin extra (como losa o madera); si es chapa, sumá 10 % (sinusoidal) o 20 a 30 % si la curvatura es más marcada.');
  if (ask.substrate?.key === 'chapa' && ask.extraPct == null) notes.push('Chapa: sumé 10 % por la curvatura (sinusoidal). Si es más curva, decime +20 % o +30 %.');
  const effM2 = ask.m2 * (1 + extraPct / 100);
  let kgPerM2 = ask.kgPerM2;
  let rateSource = 'la que me pasaste';
  if (!kgPerM2 && ask.thicknessMm) {
    const density = ask.density || (ficha?.globalMin ? (ficha.globalMin + ficha.globalMax) / 2 : null);
    if (density) { kgPerM2 = round(ask.thicknessMm / 1000 * density, 3); rateSource = `${ask.thicknessMm} mm × ${round(density, 1)} kg/m³ (densidad ${ask.density ? 'que pasaste' : 'global de la ficha'})`; }
  }
  if (!kgPerM2) notes.push('Falta el rinde (kg/m²) o el espesor en mm: sin eso no se puede calcular el consumo.');
  const ratio = ficha?.ratio || null;
  const drums = ask.drums || (ficha?.drumPoliol && ficha?.drumIso ? { poliol: ficha.drumPoliol, iso: ficha.drumIso } : null);
  if (!ratio) notes.push('No encontré la relación de mezcla del producto: nombrá el producto (por ejemplo 618-SP) para repartir poliol e isocianato.');
  if (!drums) notes.push('Faltan los tambores (kg de poliol y de isocianato por sistema).');
  const totalKg = kgPerM2 ? effM2 * kgPerM2 : null;
  const withLoss = totalKg == null ? null : totalKg * (1 + ask.lossPct / 100);
  const split = totalKg != null && ratio ? { poliol: withLoss * ratio.poliol / (ratio.poliol + ratio.iso), iso: withLoss * ratio.iso / (ratio.poliol + ratio.iso) } : null;
  let systems = null;
  if (split && drums) {
    const count = Math.max(Math.ceil(round(split.poliol / drums.poliol, 6)), Math.ceil(round(split.iso / drums.iso, 6)));
    const poliolCap = count * drums.poliol * (ratio.poliol + ratio.iso) / ratio.poliol;
    const isoCap = count * drums.iso * (ratio.poliol + ratio.iso) / ratio.iso;
    const coverKg = Math.min(poliolCap, isoCap);
    systems = {
      count, closedKg: count * (drums.poliol + drums.iso), leftoverKg: round(count * (drums.poliol + drums.iso) - withLoss, 0),
      leftoverPoliol: round(count * drums.poliol - split.poliol, 0), leftoverIso: round(count * drums.iso - split.iso, 0),
      coversEffM2: Math.floor(round(coverKg / kgPerM2, 6)), coversM2: Math.floor(round(coverKg / kgPerM2 / (1 + extraPct / 100), 6)),
      limiting: poliolCap <= isoCap ? 'poliol' : 'isocianato', toleratedLossPct: round((coverKg / withLoss - 1) * 100, 1),
      kitKg: drums.poliol + drums.iso,
    };
    if (ask.drums && ficha?.drumPoliol && (ask.drums.poliol !== ficha.drumPoliol || ask.drums.iso !== ficha.drumIso)) notes.push(`La ficha trae tambores de ${ficha.drumPoliol} kg de poliol y ${ficha.drumIso} de iso; usé los que pasaste (${ask.drums.poliol} y ${ask.drums.iso}).`);
    if (systems.toleratedLossPct < 5) notes.push(`Con ${systems.count} sistemas el margen es corto: alcanza para ${systems.toleratedLossPct} % de pérdidas. Si la obra tiene viento o overspray, conviene un sistema más.`);
  }
  return { ask, ficha, extraPct, effM2: round(effM2, 1), kgPerM2, rateSource, totalKg: totalKg == null ? null : round(totalKg, 1), withLossKg: withLoss == null ? null : round(withLoss, 1), split, ratio, drums, systems, notes };
}

const fmt = (value) => Number(value).toLocaleString('es-AR', { maximumFractionDigits: 1 });
export const sprayFor = (query, docs = []) => {
  const ask = parseSprayAsk(query);
  if (!ask) return null;
  const doc = pickFoamDoc(query, docs);
  return sprayQuote(ask, doc ? fichaMixData(doc) : null);
};

export function sprayContext(quote) {
  if (!quote) return '';
  const { ask, ficha } = quote;
  const lines = [
    `CÁLCULO DE MATERIAL PARA SPRAY (fórmula del CRM, sin IA): ${fmt(ask.m2)} m² reales${quote.extraPct ? ` + ${quote.extraPct} % de ${ask.substrate?.label || 'desarrollo'} = ${fmt(quote.effM2)} m²` : ' (sin extra de sustrato)'}.`,
    'Fórmula: m² con extra × rinde (kg/m²) = kg de mezcla; se reparte por la relación de mezcla EN PESO de la ficha; los sistemas son tambores cerrados (poliol + isocianato) y se cuentan por el componente que primero pide otro tambor.',
    'El extra por curvatura depende del sustrato (chapa sinusoidal 10 %, más curva 20 a 30 %, losa o madera 0 %): si no lo dijeron, preguntalo.',
    ficha ? `Ficha usada: ${ficha.title}${ficha.ratio ? ` · relación ${ficha.ratio.poliol} : ${ficha.ratio.iso}` : ''}${ficha.drumPoliol ? ` · tambores ${ficha.drumPoliol} kg poliol / ${ficha.drumIso} kg iso` : ''}.` : 'No encontré ficha del producto nombrado.',
  ];
  if (quote.kgPerM2) lines.push(`Consumo: ${fmt(quote.kgPerM2)} kg/m² (${quote.rateSource}) → ${fmt(quote.totalKg)} kg${ask.lossPct ? `; con ${ask.lossPct} % de pérdidas ${fmt(quote.withLossKg)} kg` : ''}.`);
  if (quote.split) lines.push(`Poliol ${fmt(quote.split.poliol)} kg e isocianato ${fmt(quote.split.iso)} kg.`);
  if (quote.systems) lines.push(`Sistemas cerrados de ${fmt(quote.systems.kitKg)} kg: ${quote.systems.count} (${fmt(quote.systems.closedKg)} kg); sobran ${fmt(quote.systems.leftoverKg)} kg; cubren hasta ${fmt(quote.systems.coversM2)} m² reales; manda el ${quote.systems.limiting}; aguantan ${fmt(quote.systems.toleratedLossPct)} % de pérdidas.`);
  for (const note of quote.notes) lines.push(`- Aviso: ${note}`);
  lines.push('Respondé con esos números tal cual y explicá la cuenta en pocas líneas. No inventes datos que no estén en la pregunta ni en la ficha.');
  return lines.join('\n');
}
