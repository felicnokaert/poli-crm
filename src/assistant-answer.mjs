// Respuesta concreta del asistente (21/10, pedido de Felipe: "trae mucha info y no me da la respuesta").
// Sin IA: reconoce qué se pregunta (rendimiento, tiempos, mezcla…) y de qué producto, saca de las guías
// solo las líneas que responden eso y arma "cómo lo respondemos en Mercado Libre" con las frases que el
// equipo más repite (Felipe: la experiencia del equipo pesa más que la ficha). Nunca inventa: todo sale
// de lo cargado y dice de dónde.
import { plain } from './knowledge-search.mjs';

export const INTENTS = [
  { key: 'rendimiento', label: 'Rendimiento', ask: ['rinde', 'rinden', 'rendimiento', 'cubre', 'cubro', 'alcanza', 'necesito', 'cantidad', 'm2', 'metro', 'metros', 'kilo', 'kilos', 'kg', 'litro', 'litros', 'gramos', 'consumo'], search: ['rinde', 'rendimiento', 'cubre', 'm2'], line: ['rendimiento', 'rinde', 'm2', 'm²', 'por metro', 'kilo x', 'kg por', 'kg/m'], evidence: /\d[\d.,]*\s*(?:g|gr|gramos|kg|kilos?|litros?)\b.*?(?:m2|m²|metro)/i },
  { key: 'tiempos', label: 'Tiempos de secado y curado', ask: ['seca', 'secado', 'secar', 'curado', 'cura', 'curar', 'tarda', 'demora', 'tiempo', 'tiempos', 'horas', 'gelificacion', 'gelifica', 'endurece'], search: ['secado', 'curado', 'tarda'], line: ['curado', 'secado', 'seca', 'tacto', 'gelific', 'tiempo de trabajo', 'tiempo abierto', 'horas', ' h ', ' min', 'dias'], evidence: /\d+\s*(?:a|y|-)?\s*\d*\s*(?:h|hs|horas|min|minutos|d[ií]as|semanas?)\b/i },
  { key: 'mezcla', label: 'Mezcla y proporción', ask: ['mezcla', 'mezclar', 'proporcion', 'relacion', 'catalizador', 'partes', 'endurecedor', 'dosifica'], search: ['mezcla', 'proporcion', 'catalizador'], line: ['mezcla', 'relacion', 'partes', 'proporcion', 'catalizador', '1:1', '2:1'], evidence: /\d\s*(?::|a|x|\/)\s*\d|partes?/i },
  { key: 'alimentos', label: 'Contacto con alimentos y toxicidad', ask: ['alimento', 'alimentos', 'comida', 'toxico', 'toxica', 'peces', 'acuario', 'fda', 'mate', 'vaso', 'potable', 'bebida', 'bebidas'], search: ['alimentos', 'toxico', 'peces'], line: ['alimento', 'toxic', 'fda', 'peces', 'inerte'] },
  { key: 'temperatura', label: 'Temperatura', ask: ['temperatura', 'calor', 'frio', 'grados', 'sol', 'resiste'], search: ['temperatura', 'calor'], line: ['°c', 'temperatura', 'calor', 'grados', 'frio'] },
  { key: 'espesor', label: 'Espesor', ask: ['espesor', 'capa', 'capas', 'grosor', 'alto', 'profundidad', 'colada'], search: ['espesor', 'capa'], line: ['espesor', 'capa', ' mm', ' cm'] },
  // 21/10: los temas que más preguntan en Mercado Libre y faltaban (sirve para, aplicación, medidas, envíos, color, diferencias).
  { key: 'usos', label: 'Para qué sirve', ask: ['sirve', 'apto', 'apta', 'techo', 'techos', 'chapa', 'madera', 'piso', 'pisos', 'pared', 'paredes', 'mesada', 'mesadas', 'molde', 'moldes', 'exterior', 'interior', 'humedad', 'goteras', 'pileta', 'tanque', 'banera', 'heladera', 'camion', 'aislar'], search: ['sirve', 'apto', 'recomendamos'], line: ['sirve', 'apto', 'apta', 'ideal', 'recomend', 'se puede', 'puede aplicar', 'perfectamente'] },
  { key: 'aplicacion', label: 'Cómo se aplica', ask: ['aplicar', 'aplica', 'aplico', 'colocar', 'coloca', 'poner', 'pongo', 'pegar', 'rellenar', 'pistola', 'limpiador', 'pico', 'agitar', 'proyectar', 'preparar', 'lijar', 'imprimacion'], search: ['aplicar', 'pistola', 'aplicacion'], line: ['aplic', 'pistola', 'limpiador', 'agit', 'proyect', 'lij', 'capa', 'pico', 'imprim'] },
  { key: 'medidas', label: 'Medidas y presentación', ask: ['ancho', 'largo', 'alto', 'medida', 'medidas', 'rollo', 'dimensiones', 'tamano', 'presentacion', 'presentaciones', 'viene', 'gramos', 'mililitros'], search: ['medidas', 'ancho', 'largo'], line: ['ancho', 'largo', 'medida', 'mts', ' cm', ' x ', 'rollo', 'presentacion', 'viene en'], evidence: /\d[\d.,]*\s*(?:x|por)\s*\d|\d[\d.,]*\s*(?:mts?|metros|cm|mm|ml|cc|gr|kg)\b/i },
  { key: 'envios', label: 'Envíos y retiro', ask: ['envio', 'envios', 'envian', 'mandan', 'llegaria', 'llega', 'llegar', 'llegan', 'retiro', 'retirar', 'retira', 'flete', 'correo', 'domicilio', 'local'], search: ['envio', 'retiro'], line: ['envio', 'envios', 'retir', 'llega', 'flex', 'correo', 'local', 'domicilio'] },
  { key: 'color', label: 'Colores', ask: ['color', 'colores', 'blanco', 'negro', 'gris', 'rojo', 'transparente', 'pigmento', 'pigmentos', 'tenir', 'colorear'], search: ['color', 'colores', 'pigmento'], line: ['color', 'pigment', 'blanco', 'transparente', 'negro', 'gris', 'tonos'] },
  { key: 'fuego', label: 'Fuego e inflamabilidad', ask: ['ignifuga', 'ignifugo', 'ignifugas', 'fuego', 'llama', 'llamas', 'inflamable', 'incendio', 'quema', 'autoextinguible'], search: ['ignifuga', 'llama', 'fuego'], line: ['llama', 'ignif', 'fuego', 'autoextingu', 'inflamable', 'incendio'] },
  { key: 'diferencia', label: 'Diferencias entre productos', ask: ['diferencia', 'diferencias', 'versus', 'conviene', 'recomendas', 'recomiendan', 'cual es mejor'], search: ['diferencia', 'conviene'], line: ['diferencia', 'a diferencia', 'mejor', 'conviene', 'recomend', 'en cambio'] },
];

const FILLER = new Set(['que', 'para', 'con', 'los', 'las', 'una', 'uno', 'por', 'del', 'como', 'cual', 'cuales', 'sus', 'este', 'esta', 'hay', 'tiene', 'sirve', 'usar', 'uso', 'hola', 'quiero', 'saber', 'puedo', 'tengo', 'mas', 'menos', 'aprox', 'aproximado', 'cada', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'cuando', 'donde', 'necesito', 'hacer', 'tienen', 'viene', 'resina', 'producto', 'kit', 'envase', 'envases', 'lata', 'latas', 'pomo', 'pomos', 'tubo', 'pote', 'frasco', 'unidad', 'unidades', 'aerosol', 'cada', 'aproximadamente', 'buenas', 'tardes', 'dias', 'noches', 'gracias', 'consulta']);

// Cómo lo dicen los clientes (21/10, Felipe: "que distinga cómo le pueden decir los clientes, así como está
// en las preguntas"): frases y errores comunes de Mercado Libre pasan a la palabra que entiende el asistente.
// Se aplica antes de reconocer tema y producto. Sumar acá lo que se vea en las preguntas.
const SAYINGS = [
  [/\bvidrio liquido\b/g, 'resina epoxi'],
  [/\b(easy ?spray|easi ?spray|isi ?spray|easy espray|izi ?spray)\b/g, 'easyspray'],
  [/\bpoxi ?plast\b/g, 'poxiplast'],
  [/\b(espuma expansiva|espuma de poliuretano|espuma proyectable|espuma aislante|poliuretano expandido)\b/g, 'espuma'],
  [/\b(cuant[oa]s? (necesito|preciso|tengo que comprar|me hacen falta|compro|llevo)|me alcanza|cuanto me hace falta|para cubrir|cuantas latas|cuantos pomos|cuantos envases|cuantas unidades)\b/g, 'rinde'],
  [/\b(rendmiento|redimiento|rendimineto|rrinde)\b/g, 'rendimiento'],
  [/\b(en cuanto tiempo|cuanto tiempo|a las cuantas horas|cuando puedo (usar|pisar|pintar|desmoldar)|cuanto demora)\b/g, 'tiempo'],
  [/\bagua potable\b/g, 'alimentos'],
  [/\b(es toxic[oa]|apto (para )?alimentos?|para (el )?mate|tablas? de picar|contacto con comida)\b/g, 'alimentos'],
  [/\b(cuanto aguanta|aguanta el calor|soporta (el )?calor|al sol)\b/g, 'temperatura'],
  [/\bembase\b/g, 'envase'],
];

export function understand(query) {
  let text = plain(query);
  for (const [pattern, replacement] of SAYINGS) text = text.replace(pattern, replacement);
  return text;
}

// 23/10: en "cuánto sale la resina de 1 kg" el kilo es la presentación, no una pregunta de rendimiento.
const PRICE_ASK = /\b(precio\w*|cuanto (sale|salen|cuesta|cuestan|vale|valen)|a cuanto)\b/;
const UNIT_WORDS = new Set(['kg', 'kilo', 'kilos', 'litro', 'litros', 'gramos']);

export function detectIntent(query) {
  const text = understand(query);
  const price = PRICE_ASK.test(text);
  const words = text.split(/[^a-z0-9]+/).filter((word) => word && !(price && UNIT_WORDS.has(word)));
  let best = null;
  for (const intent of INTENTS) {
    const hits = words.filter((word) => intent.ask.includes(word)).length;
    if (hits && (!best || hits > best.hits)) best = { intent, hits };
  }
  return best?.intent || null;
}

// Palabras del producto: lo que queda de la pregunta sin las palabras del tema ni de relleno.
export function productWords(query, intent) {
  const ask = new Set(intent?.ask || []);
  return [...new Set(understand(query).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ask.has(word) && !FILLER.has(word)))];
}

// Consulta para el buscador de Mercado Libre: (producto y tema) o (producto y sinónimo)…
// "easy spray" también se escribe "Easyspray": se prueban las dos formas.
export function mlQuery(query, intent) {
  const words = productWords(query, intent);
  const products = [words.join(' ')];
  if (words.length === 2) products.push(words.join(''));
  if (!intent) return products.filter(Boolean).join(' or ');
  return products.flatMap((product) => intent.search.map((word) => `${product} ${word}`.trim())).join(' or ');
}

const hasAny = (text, words) => { const flat = ` ${plain(text)} `; return words.some((word) => flat.includes(plain(word))); };

// Líneas de las guías que responden el tema, de las guías del producto (las validadas primero).
export function guideFacts(guides = [], query, intent, { max = 4 } = {}) {
  if (!intent) return [];
  const words = productWords(query, intent);
  const matching = guides.filter((guide) => {
    const text = plain([guide.product, guide.family, guide.summary].join(' '));
    return words.length ? words.some((word) => text.includes(word)) : false;
  }).sort((a, b) => Number(b.status === 'validada') - Number(a.status === 'validada'));
  const facts = [];
  for (const guide of matching) {
    for (const section of guide.sections || []) {
      if (/preguntarle/i.test(section.title || '')) continue;
      for (const item of section.items || []) {
        if (hasAny(item, intent.line)) facts.push({ guide: guide.product, validated: guide.status === 'validada', text: item });
      }
    }
  }
  return facts.slice(0, max);
}

// Saca el saludo con el usuario de Mercado Libre y la firma.
export function cleanAnswer(text) {
  return String(text || '')
    .replace(/^\s*Hola[\s,]+(?:[A-ZÑ0-9_.\-]{2,}\s+)*[A-ZÑ0-9_.\-]{2,}[\s,!.]*/, '')
    .replace(/\s*(Saludos|Esperamos su compra|Muchas gracias|Gracias por)\b.*$/is, '')
    .replace(/\s*\b(de )?(Grupo Poliplast|Foam Factory|Poliplast)\.?\s*$/i, '')
    .trim();
}

function sentences(text) {
  return String(text).split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 8);
}
// Los links cambian de una respuesta a otra ("te dejo el link <url>"): no cuentan para comparar.
const key = (sentence) => plain(sentence).replace(/https?:\/\/\S+/g, ' link ').replace(/[^a-z0-9]+/g, ' ').trim();

// Cantidades de una frase, en la misma unidad (cm → mm, kilos → kg, m² → m2…), para comparar respuestas.
const QUANTITY = /(\d+(?:[.,]\d+)?)\s*(m2|m²|mts2|metros cuadrados|cm|mm|kg|kilos?|gr|gramos|g|litros?|lts?|l|hs|horas|h|minutos|min|d[ií]as)(?![a-záéíóúñ])/gi;
const UNIT = { 'm²': 'm2', mts2: 'm2', 'metros cuadrados': 'm2', kilo: 'kg', kilos: 'kg', gr: 'g', gramos: 'g', litro: 'l', litros: 'l', lt: 'l', lts: 'l', hs: 'h', horas: 'h', minutos: 'min', dias: 'd', 'días': 'd' };
export function quantities(text) {
  const found = new Set();
  for (const [, raw, rawUnit] of String(text).matchAll(QUANTITY)) {
    let value = Number(raw.replace(',', '.'));
    let unit = UNIT[rawUnit.toLowerCase()] || rawUnit.toLowerCase();
    if (unit === 'cm') { value *= 10; unit = 'mm'; }
    found.add(`${value} ${unit}`);
  }
  return [...found].sort();
}

function sameNumbers(answers, relevant) {
  const groups = new Map();
  for (const answer of answers) {
    const parts = sentences(answer).filter((sentence) => relevant(sentence) && quantities(sentence).length);
    const signature = quantities(parts.join(' ')).join(' | ');
    if (!signature) continue;
    const group = groups.get(signature) || { uses: 0, texts: [] };
    group.uses += 1;
    group.texts.push(parts.join(' '));
    groups.set(signature, group);
  }
  const best = [...groups.values()].sort((a, b) => b.uses - a.uses)[0];
  if (!best || best.uses < 2) return null;
  return { text: best.texts.sort((a, b) => a.length - b.length)[0], uses: best.uses };
}

// La respuesta que el equipo más repite: frases que aparecen en varias respuestas, en su orden.
export function teamAnswer(rows = [], intent) {
  const answers = rows
    .filter((row) => row.kind === 'pregunta')
    .map((row) => cleanAnswer(String(row.body || '').split('\nRespuesta: ')[1] || ''))
    .filter(Boolean);
  if (!answers.length) return null;
  const counts = new Map();
  for (const answer of answers) for (const sentence of new Set(sentences(answer).map(key))) counts.set(sentence, (counts.get(sentence) || 0) + 1);
  const relevant = (sentence) => !intent || hasAny(sentence, intent.line);
  const ranked = [...counts.entries()].filter(([sentence]) => relevant(sentence)).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const top = ranked[0][1];
  // Misma respuesta con otras palabras ("rinde 2m2 en 2cm" = "2 m² en 20 mm"): se agrupan por los números.
  const byNumbers = sameNumbers(answers, relevant);
  if (byNumbers && byNumbers.uses > top) return { ...byNumbers, total: answers.length };
  // Si ninguna frase se repite, no hay "respuesta del equipo": se muestran las distintas que se dieron.
  if (top < 2) {
    // Solo las frases con el dato (números con horas, kilos por m², etc.), de respuestas distintas.
    const proof = (sentence) => (intent?.evidence ? intent.evidence.test(sentence) : relevant(sentence));
    const examples = [...new Set(answers.map((answer) => sentences(answer).filter(proof).slice(0, 2).join(' ')).filter(Boolean).map((text) => text.slice(0, 260)))].slice(0, 3);
    if (!examples.length) return null;
    return { varied: true, examples, uses: 0, total: answers.length };
  }
  const keep = new Set(ranked.filter(([, count]) => count >= Math.max(2, top * 0.3)).slice(0, 3).map(([sentence]) => sentence));
  // El texto original (con acentos) sale de la respuesta que más frases elegidas tiene.
  const source = answers.map((answer) => ({ answer, parts: sentences(answer).filter((sentence) => keep.has(key(sentence))) }))
    .sort((a, b) => b.parts.length - a.parts.length)[0];
  const text = source.parts.length ? source.parts.join(' ') : ranked[0][0];
  const uses = answers.filter((answer) => sentences(answer).some((sentence) => keep.has(key(sentence)))).length;
  return { text, uses, total: answers.length };
}

// Lo que se le pasa a la IA (src/AssistantWindow.jsx → lib/assistant-ai.mjs): primero la respuesta del
// equipo y las líneas de la guía, después lo demás que encontró el buscador, todo con su origen.
export function buildAiContext({ intent = null, facts = [], team = null, result = null, mlRows = [], taught = [] } = {}) {
  const lines = [];
  if (intent) lines.push(`Tema detectado: ${intent.label}`);
  if (taught.length) lines.push('Respuestas validadas por Felipe (son las oficiales: usalas antes que todo lo demás):', ...taught.map((entry) => `- P: ${entry.question}${entry.product ? ` [${entry.product}]` : ''} | R: ${entry.answer}`));
  if (team && !team.varied) lines.push(`Respuesta del equipo en Mercado Libre (la que más repetimos, ${team.uses} de ${team.total} respuestas; es la válida): ${team.text}`);
  if (team?.varied) lines.push('En Mercado Libre respondimos distinto según el producto:', ...team.examples.map((text) => `- ${text}`));
  if (facts.length) lines.push('Según las guías de producto:', ...facts.map((fact) => `- ${fact.text} (${fact.guide}${fact.validated ? ', validada' : ', borrador'})`));
  for (const key of result?.order || Object.keys(result?.groups || {})) {
    const items = result?.groups?.[key];
    if (!items?.length) continue;
    lines.push(`[${key}]`, ...items.slice(0, 4).map((item) => `- ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''}: ${String(item.snippet || item.text || '').replace(/\s+/g, ' ').slice(0, 400)}`));
  }
  const answers = (mlRows || []).filter((row) => row.kind === 'pregunta').slice(0, 6)
    .map((row) => { const [question, answer] = String(row.body || '').replace(/^Pregunta: /, '').split('\nRespuesta: '); return `- P: ${question.slice(0, 200)} | R: ${cleanAnswer(answer || '').slice(0, 300)}`; });
  if (answers.length) lines.push('Preguntas parecidas respondidas en Mercado Libre:', ...answers);
  return lines.join('\n');
}

// Lo que Felipe le enseñó (tabla assistant_knowledge) que coincide con la pregunta: cuantas más palabras
// en común, mejor. Si la enseñanza es de un producto, la pregunta tiene que nombrarlo.
export function matchTaught(entries = [], query, { max = 3 } = {}) {
  const words = understand(query).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !FILLER.has(word));
  if (!words.length) return [];
  const flatQuery = understand(query).replace(/[^a-z0-9]+/g, '');
  return entries.map((entry) => {
    const product = plain(entry.product || '').split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    if (product.length && !product.some((word) => words.includes(word) || flatQuery.includes(word))) return null;
    const text = ` ${plain(`${entry.question} ${entry.product}`).replace(/[^a-z0-9]+/g, ' ')} `;
    const joined = product.join('');
    const hits = words.filter((word) => text.includes(` ${word}`) || (joined && joined === word)).length;
    const needed = words.length <= 2 ? words.length : Math.ceil(words.length / 2);
    return hits >= needed ? { ...entry, hits } : null;
  }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, max);
}
