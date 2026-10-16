// "Preguntale a tus productos" (Academia): responde con lo que dicen las fichas técnicas, sin IA y sin
// inventar (en español o en inglés: las fichas de Penosil vienen en inglés, Technical Data Sheet).
//
// inventar. 1) Reconoce de qué producto se habla y qué dato se busca (temperatura, rendimiento...).
// 2) Elige las fichas de ese producto. 3) Devuelve las líneas literales que tienen ese dato, con su
// fuente. Si la ficha no lo dice, lo dice. El día que haya una IA conectada, esto es lo que se le pasa.
import { plain } from './knowledge-search.mjs';

// Qué dato se pregunta -> palabras con que aparece en una ficha.
export const TOPICS = [
  ['temperatura', 'Temperatura', ['temperature', 'temperatura', 'temp.', '°c', 'ºc', ' grados', 'precalent', 'calentamiento', 'calentador', 'termico']],
  ['rendimiento', 'Rendimiento / consumo', ['output', 'yield', 'coverage', 'm²/can', 'm2/can', 'rinde', 'rendimiento', 'cobertura', 'consumo', 'm2', 'm²', 'kg/m', 'l/m', 'por metro', 'cubre']],
  ['densidad', 'Densidad', ['density', 'densidad', 'kg/m3', 'kg/m³', 'g/cm', 'peso especifico']],
  ['tiempos', 'Tiempos (crema, hilo, secado, curado)', ['tack free', 'rise time', 'cured', 'curing', 'cutting time', 'drying', 'crema', 'hilo', 'tack', 'secado', 'curado', 'gel', 'pot life', 'vida util de la mezcla', 'tiempo de', 'segundos', 'minutos', 'horas']],
  ['mezcla', 'Relación de mezcla', ['mixing ratio', 'mix ratio', 'relacion', 'proporcion', 'mezcla', 'a:b', '1:1', 'partes', 'componente a', 'componente b']],
  ['viscosidad', 'Viscosidad', ['viscosity', 'viscosidad', 'cps', 'mpa']],
  ['espesor', 'Espesor', ['thickness', 'espesor', 'mm', 'micrones', 'mils']],
  ['presion', 'Presión de trabajo', ['pressure', 'presion', 'bar', 'psi']],
  ['almacenamiento', 'Almacenamiento y vencimiento', ['storage', 'shelf life', 'almacen', 'vida util', 'vencimiento', 'conservar', 'meses', 'shelf']],
  ['aplicacion', 'Aplicación / modo de uso', ['application', 'aplicacion', 'aplicar', 'modo de uso', 'pistola', 'proyect', 'rodillo', 'pincel', 'superficie', 'sustrato']],
  ['seguridad', 'Seguridad', ['safety', 'hazard', 'seguridad', 'precaucion', 'proteccion', 'guantes', 'mascara', 'toxic', 'inflamable']],
  ['presentacion', 'Presentación / envase', ['package', 'aerosol can', 'envase', 'presentacion', 'tambor', 'bidon', 'lata', 'aerosol', 'kit', 'cartucho']],
  ['colores', 'Colores', ['colour', 'color', 'colores', 'blanco', 'gris', 'negro']],
];

// Palabras que hablan del dato, no del producto (no sirven para reconocer la ficha).
const QUESTION_WORDS = new Set(['que', 'cual', 'cuanto', 'cuanta', 'como', 'con', 'para', 'trabaja', 'trabajo', 'tiene', 'se', 'el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'es', 'son', 'en', 'por', 'hay', 'me', 'decis', 'sabes', 'necesito', 'quiero', 'saber', 'dato', 'datos', 'producto', 'ficha', 'tecnica', 'aplica', 'usa', 'usar']);
const topicWords = new Set(TOPICS.flatMap(([, , words]) => words.map((word) => plain(word).trim())).flatMap((word) => word.split(/[^a-z0-9]+/)).filter(Boolean));

export function detectTopics(question = '') {
  const text = ` ${plain(question)} `;
  return TOPICS.filter(([key, , words]) => text.includes(key.slice(0, 6)) || words.some((word) => text.includes(plain(word)))).map(([key]) => key);
}

// Palabras que identifican el producto: códigos (618, 619-SP), marcas y nombres ("easy spray", "penosil").
export function productTokens(question = '') {
  return [...new Set(plain(question).split(/[^a-z0-9]+/).filter((token) => (token.length > 1 && /\d/.test(token)) || (token.length > 2 && !QUESTION_WORDS.has(token) && !topicWords.has(token))))];
}

const haystack = (doc) => plain([doc.title, doc.product, doc.sku, doc.sourceFile || doc.source_file, doc.family].filter(Boolean).join(' '));

export function rankDocuments(docs = [], tokens = []) {
  if (!tokens.length) return [];
  return docs
    .filter((doc) => doc.extractedText || doc.extracted_text)
    .map((doc) => {
      const name = haystack(doc);
      const body = plain(String(doc.extractedText || doc.extracted_text || '').slice(0, 4000));
      let score = 0;
      for (const token of tokens) {
        if (name.includes(token)) score += /\d/.test(token) ? 6 : 4;
        else if (body.includes(token)) score += /\d/.test(token) ? 2 : 1;
      }
      const vigente = doc.status === 'vigente';
      return { doc, score: score + (vigente && score ? 0.5 : 0) };
    })
    .filter((entry) => entry.score >= Math.min(4, tokens.length * 2))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.doc);
}

// Líneas de la ficha que hablan del dato pedido (con la siguiente si sigue el número en otra línea).
export function extractLines(text = '', topics = [], limit = 6) {
  const words = TOPICS.filter(([key]) => topics.includes(key)).flatMap(([, , list]) => list.map(plain));
  const lines = String(text).split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 2);
  const found = [];
  for (let index = 0; index < lines.length && found.length < limit; index += 1) {
    const line = ` ${plain(lines[index])} `;
    if (!words.some((word) => line.includes(word))) continue;
    let snippet = lines[index];
    // El número sigue en el renglón de abajo: se unen y ese renglón no se repite después.
    if (!/\d/.test(snippet) && lines[index + 1] && /\d/.test(lines[index + 1])) { snippet = `${snippet} ${lines[index + 1]}`; index += 1; }
    if (!found.includes(snippet)) found.push(snippet.slice(0, 300));
  }
  return found;
}

// Pedido de solución ("algo que aísle térmicamente y sea espuma rígida de PU"): no nombra un producto,
// describe una necesidad. Cada palabra se busca con sus equivalentes (español e inglés, porque las fichas
// de Penosil vienen en inglés) y se ordenan las fichas por cuántas partes del pedido cubren.
const NEED_SYNONYMS = {
  aisl: ['aisl', 'insulation', 'insulating'],
  termic: ['termic', 'thermal', 'conductividad', 'conductivity', 'lambda'],
  acust: ['acust', 'sonido', 'sound', 'acoustic', 'ruido'],
  espuma: ['espuma', 'foam', 'gunfoam'],
  rigid: ['rigid', 'rigido', 'rigida'],
  flexib: ['flexib', 'elastic', 'elastico', 'blando'],
  poliuretano: ['poliuretano', 'polyurethane', ' pu ', 'pur', 'isocianato', 'poliol'],
  poliurea: ['poliurea', 'polyurea'],
  impermeab: ['impermeab', 'waterproof', 'estanqu', 'membrana', 'agua'],
  fuego: ['fuego', 'ignifug', 'fire', 'incend', 'b1', 'retard'],
  pega: ['pega', 'adhesiv', 'adhesive', 'pegar', 'fija', 'fix'],
  sella: ['sella', 'sellador', 'sealant', 'sellar', 'junta', 'joint'],
  limpi: ['limpi', 'cleaner', 'clean'],
  proyect: ['proyect', 'spray', 'pulveriz', 'sprayable'],
  techo: ['techo', 'cubierta', 'roof', 'terraza'],
  frio: ['frio', 'camara', 'refriger', 'cold'],
  madera: ['madera', 'wood'],
  metal: ['metal', 'chapa', 'acero', 'steel'],
  hormigon: ['hormigon', 'concreto', 'concrete', 'mamposteria'],
  resina: ['resina', 'resin', 'epoxi', 'epoxy', 'poliester', 'polyester'],
  rapido: ['rapido', 'fast', 'quick', 'curado rapido'],
  exterior: ['exterior', 'outdoor', 'intemperie', 'uv'],
};
const NEED_STOP = new Set(['algo', 'que', 'quiero', 'necesito', 'busco', 'para', 'sea', 'tenga', 'producto', 'productos', 'como', 'cual', 'cuales', 'sirva', 'sirve', 'usar', 'mejor', 'recomendas', 'recomendame', 'tienen', 'tenemos', 'hay', 'con', 'sin', 'una', 'uno', 'los', 'las', 'del', 'por', 'muy', 'mas']);

export function needConcepts(question = '') {
  const words = plain(question).split(/[^a-z0-9]+/).filter((word) => (word.length > 2 || ['pu', 'uv'].includes(word)) && !NEED_STOP.has(word));
  const concepts = [];
  for (const word of words) {
    const key = Object.keys(NEED_SYNONYMS).find((root) => word.startsWith(root) || NEED_SYNONYMS[root].some((syn) => word.startsWith(syn.trim())));
    const terms = key ? NEED_SYNONYMS[key] : [word];
    if (!concepts.some((concept) => concept.key === (key || word))) concepts.push({ key: key || word, terms });
  }
  return concepts;
}

export function recommendDocuments(question = '', docs = [], limit = 5) {
  const concepts = needConcepts(question);
  // Con una sola palabra no hay pedido que ordenar ("qué temperatura" sin producto no recomienda nada).
  if (concepts.length < 2) return [];
  return docs
    .filter((doc) => doc.extractedText || doc.extracted_text)
    .map((doc) => {
      const name = ` ${haystack(doc)} `;
      const body = ` ${plain(doc.extractedText || doc.extracted_text)} `;
      const covered = concepts.filter((concept) => concept.terms.some((term) => name.includes(term) || body.includes(term)));
      const inName = concepts.filter((concept) => concept.terms.some((term) => name.includes(term))).length;
      return { doc, covered, score: covered.length * 2 + inName };
    })
    .filter((entry) => entry.covered.length >= Math.min(2, concepts.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ doc, covered }) => {
      const terms = covered.flatMap((concept) => concept.terms.map((term) => term.trim()));
      const lines = String(doc.extractedText || doc.extracted_text).split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 8 && terms.some((term) => ` ${plain(line)} `.includes(term))).slice(0, 3);
      return { doc, lines, covered: covered.map((concept) => concept.key), total: concepts.length };
    });
}

export function answerQuestion(question = '', docs = []) {
  const topics = detectTopics(question);
  const tokens = productTokens(question);
  const ranked = rankDocuments(docs, tokens).slice(0, 3);
  // Sin un producto reconocible (o un pedido tipo "algo que…"): modo recomendación.
  const asksForSolution = /\b(algo|que sirva|recomend|necesito|busco|para (aislar|pegar|sellar|impermeabilizar|limpiar|proyectar))/.test(plain(question));
  if (!ranked.length || (asksForSolution && !topics.length)) {
    const recommended = recommendDocuments(question, docs);
    if (recommended.length) return { mode: 'recomendacion', topics, topicLabels: [], tokens, results: recommended, answered: true };
  }
  const results = ranked.map((doc) => ({
    doc,
    lines: topics.length ? extractLines(doc.extractedText || doc.extracted_text, topics) : [],
  }));
  return {
    mode: 'producto',
    topics,
    topicLabels: TOPICS.filter(([key]) => topics.includes(key)).map(([, label]) => label),
    tokens,
    results,
    answered: results.some((result) => result.lines.length > 0),
  };
}

// Consulta lista para pegar en Claude o ChatGPT (gratis, con la suscripción de cada uno): la pregunta
// y el texto de las fichas encontradas, con la instrucción de no inventar.
export function questionPrompt(question, results = []) {
  const parts = [
    'Sos asistente técnico de Grupo Poliplast. Respondé en español, corto y concreto, usando SOLO la información de las fichas técnicas de abajo.',
    'Si el dato no está en las fichas, decí "La ficha no lo indica" y no lo inventes. Citá de qué ficha sale cada dato.',
    '',
    `Pregunta: ${question}`,
  ];
  for (const { doc } of results) {
    parts.push('', `--- Ficha: ${doc.title}${doc.status === 'vigente' ? '' : ' (sin validar todavía)'} ---`, String(doc.extractedText || doc.extracted_text || '').slice(0, 12000));
  }
  return parts.join('\n');
}
