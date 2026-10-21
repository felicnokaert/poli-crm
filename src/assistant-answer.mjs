// Respuesta concreta del asistente (21/10, pedido de Felipe: "trae mucha info y no me da la respuesta").
// Sin IA: reconoce qué se pregunta (rendimiento, tiempos, mezcla…) y de qué producto, saca de las guías
// solo las líneas que responden eso y arma "cómo lo respondemos en Mercado Libre" con las frases que el
// equipo más repite (Felipe: la experiencia del equipo pesa más que la ficha). Nunca inventa: todo sale
// de lo cargado y dice de dónde.
import { plain } from './knowledge-search.mjs';

export const INTENTS = [
  { key: 'rendimiento', label: 'Rendimiento', ask: ['rinde', 'rinden', 'rendimiento', 'cubre', 'cubro', 'alcanza', 'necesito', 'cuanto', 'cantidad', 'm2', 'metro', 'metros', 'kilo', 'kilos', 'kg', 'litro', 'litros', 'gramos', 'consumo'], search: ['rinde', 'rendimiento', 'cubre', 'm2'], line: ['rendimiento', 'rinde', 'm2', 'm²', 'por metro', 'kilo x', 'kg por', 'kg/m'], evidence: /\d[\d.,]*\s*(?:g|gr|gramos|kg|kilos?|litros?)\b.*?(?:m2|m²|metro)/i },
  { key: 'tiempos', label: 'Tiempos de secado y curado', ask: ['seca', 'secado', 'secar', 'curado', 'cura', 'curar', 'tarda', 'demora', 'tiempo', 'tiempos', 'horas', 'gelificacion', 'gelifica', 'endurece'], search: ['secado', 'curado', 'tarda'], line: ['curado', 'secado', 'seca', 'tacto', 'gelific', 'tiempo de trabajo', 'tiempo abierto', 'horas', ' h ', ' min', 'dias'], evidence: /\d+\s*(?:a|y|-)?\s*\d*\s*(?:h|hs|horas|min|minutos|d[ií]as|semanas?)\b/i },
  { key: 'mezcla', label: 'Mezcla y proporción', ask: ['mezcla', 'mezclar', 'proporcion', 'relacion', 'catalizador', 'partes', 'endurecedor', 'dosifica'], search: ['mezcla', 'proporcion', 'catalizador'], line: ['mezcla', 'relacion', 'partes', 'proporcion', 'catalizador', '1:1', '2:1'], evidence: /\d\s*(?::|a|x|\/)\s*\d|partes?/i },
  { key: 'alimentos', label: 'Contacto con alimentos y toxicidad', ask: ['alimento', 'alimentos', 'comida', 'toxico', 'toxica', 'peces', 'acuario', 'fda', 'mate', 'vaso'], search: ['alimentos', 'toxico', 'peces'], line: ['alimento', 'toxic', 'fda', 'peces', 'inerte'] },
  { key: 'temperatura', label: 'Temperatura', ask: ['temperatura', 'calor', 'frio', 'grados', 'sol', 'resiste'], search: ['temperatura', 'calor'], line: ['°c', 'temperatura', 'calor', 'grados', 'frio'] },
  { key: 'espesor', label: 'Espesor', ask: ['espesor', 'capa', 'capas', 'grosor', 'alto', 'profundidad', 'colada'], search: ['espesor', 'capa'], line: ['espesor', 'capa', ' mm', ' cm'] },
];

const FILLER = new Set(['que', 'para', 'con', 'los', 'las', 'una', 'uno', 'por', 'del', 'como', 'cual', 'cuales', 'sus', 'este', 'esta', 'hay', 'tiene', 'sirve', 'usar', 'uso', 'hola', 'quiero', 'saber', 'puedo', 'tengo', 'mas', 'menos', 'aprox', 'aproximado', 'cada', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'cuando', 'donde', 'necesito', 'hacer', 'tienen', 'viene', 'resina', 'producto', 'kit']);

export function detectIntent(query) {
  const words = plain(query).split(/[^a-z0-9]+/).filter(Boolean);
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
  return [...new Set(plain(query).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ask.has(word) && !FILLER.has(word)))];
}

// Consulta para el buscador de Mercado Libre: (producto y tema) o (producto y sinónimo)…
export function mlQuery(query, intent) {
  const product = productWords(query, intent).join(' ');
  if (!intent) return product;
  return intent.search.map((word) => `${product} ${word}`.trim()).join(' or ');
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
const key = (sentence) => plain(sentence).replace(/[^a-z0-9]+/g, ' ').trim();

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
export function buildAiContext({ intent = null, facts = [], team = null, result = null, mlRows = [] } = {}) {
  const lines = [];
  if (intent) lines.push(`Tema detectado: ${intent.label}`);
  if (team && !team.varied) lines.push(`Respuesta del equipo en Mercado Libre (la que más repetimos, ${team.uses} de ${team.total} respuestas; es la válida): ${team.text}`);
  if (team?.varied) lines.push('En Mercado Libre respondimos distinto según el producto:', ...team.examples.map((text) => `- ${text}`));
  if (facts.length) lines.push('Según las guías de producto:', ...facts.map((fact) => `- ${fact.text} (${fact.guide}${fact.validated ? ', validada' : ', borrador'})`));
  for (const [key, items] of Object.entries(result?.groups || {})) {
    if (!items?.length) continue;
    lines.push(`[${key}]`, ...items.slice(0, 4).map((item) => `- ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''}: ${String(item.snippet || item.text || '').replace(/\s+/g, ' ').slice(0, 400)}`));
  }
  const answers = (mlRows || []).filter((row) => row.kind === 'pregunta').slice(0, 6)
    .map((row) => { const [question, answer] = String(row.body || '').replace(/^Pregunta: /, '').split('\nRespuesta: '); return `- P: ${question.slice(0, 200)} | R: ${cleanAnswer(answer || '').slice(0, 300)}`; });
  if (answers.length) lines.push('Preguntas parecidas respondidas en Mercado Libre:', ...answers);
  return lines.join('\n');
}
