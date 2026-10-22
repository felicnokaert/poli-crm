// Prueba del asistente con preguntas reales de Mercado Libre (21/10, pedido de Felipe: "probá y entrená a la
// IA con las mismas preguntas de Mercado Libre"). Se toma una pregunta ya respondida, se le pasa a la IA lo
// que el equipo respondió en OTRAS preguntas de esa misma publicación (la respuesta real queda afuera) y se
// compara con lo que respondimos de verdad. Si la IA le erra, Felipe le enseña la respuesta correcta.
import { buildAiContext, cleanAnswer, detectIntent, guideFacts, quantities, teamAnswer } from './assistant-answer.mjs';

// Mezcla estable (la misma semilla da el mismo orden) para no repetir siempre las mismas preguntas.
function shuffle(list, seed) {
  const copy = [...list];
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 16807) % 2147483647;
    const other = state % (index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// Preguntas con un tema reconocible (rendimiento, tiempos, mezcla…), una por publicación, de publicaciones
// con 3 o más preguntas (ahí hay respuesta del equipo para comparar).
export function pickQuestions(questions = [], titles = {}, { count = 10, seed = Date.now() } = {}) {
  const perItem = new Map();
  for (const row of questions) {
    if (!row?.item_id || !String(row.answer || '').trim()) continue;
    perItem.set(row.item_id, (perItem.get(row.item_id) || 0) + 1);
  }
  const candidates = shuffle(questions.filter((row) => row?.item_id && perItem.get(row.item_id) >= 3 && String(row.answer || '').trim()
    && detectIntent(row.question)), seed);
  const used = new Set();
  const picked = [];
  for (const row of candidates) {
    if (used.has(row.item_id)) continue;
    used.add(row.item_id);
    picked.push({ ...row, title: titles[row.item_id] || '', intent: detectIntent(row.question) });
    if (picked.length >= count) break;
  }
  return shuffle(picked, seed + 1);
}

// La pregunta tal como la haría alguien del equipo: con el producto (el título de la publicación).
export function trainingQuestion(row) {
  const question = String(row.question || '').replace(/\s+/g, ' ').trim();
  return row.title ? `Un cliente pregunta por "${row.title}": ${question}` : question;
}

// Contexto para la IA sin la respuesta real: las demás preguntas de la publicación, las guías y lo enseñado.
export function trainingContext(row, siblings = [], { guides = [], taught = [] } = {}) {
  const others = siblings.filter((other) => other.id !== row.id && String(other.answer || '').trim())
    .map((other) => ({ kind: 'pregunta', body: `Pregunta: ${other.question}\nRespuesta: ${other.answer}` }));
  const intent = row.intent || detectIntent(row.question);
  const team = intent ? teamAnswer(others, intent) : null;
  const facts = intent ? guideFacts(guides, `${row.title} ${row.question}`, intent) : [];
  return { team, context: buildAiContext({ intent, facts, team, mlRows: others, taught }) };
}

export const realAnswer = (row) => cleanAnswer(row.answer || '') || String(row.answer || '');

// Respuestas sugeridas para enseñarle (21/10): por publicación y tema, la respuesta que el equipo repitió
// en 3 o más preguntas. Felipe las revisa y aprueba; nada se guarda solo.
const GENERIC = new Set(['resina', 'resinas', 'epoxi', 'epoxy', 'kit', 'kg', 'kgs', 'kilo', 'kilos', 'litro', 'litros', 'gr', 'grs', 'por', 'para', 'con', 'de', 'la', 'el', 'x', 'y', 'cristal', 'transparente', 'poliplast', 'envio', 'gratis', 'pack', 'unidad', 'unidades', 'espuma', 'espumas', 'poliuretano', 'expandido', 'aerosol', 'placa', 'lamina', 'vidrio', 'liquido', 'color', 'artesanias', 'joya', 'mualidades', 'manualidades', 'plastico', 'reforzado', 'fibra', 'proyectable', 'aislante', 'termoacustica', 'original', 'oferta', 'promo']);

export function shortProduct(title = '') {
  const words = String(title).split(/\s+/).filter((word) => word.length > 2 && !/\d/.test(word) && !GENERIC.has(word.toLowerCase()));
  return words.slice(0, 2).join(' ');
}

export function suggestTeachings(questions = [], titles = {}, { taught = [], minUses = 3, max = 30 } = {}) {
  const byItem = new Map();
  for (const row of questions) {
    if (!row?.item_id || !String(row.answer || '').trim()) continue;
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, []);
    byItem.get(row.item_id).push(row);
  }
  const known = new Set(taught.map((entry) => `${String(entry.product || '').toLowerCase()}|${String(entry.question || '').toLowerCase()}`));
  const out = [];
  for (const [itemId, rows] of byItem) {
    if (rows.length < minUses) continue;
    const byIntent = new Map();
    for (const row of rows) {
      const intent = detectIntent(row.question);
      if (!intent) continue;
      if (!byIntent.has(intent.key)) byIntent.set(intent.key, { intent, rows: [] });
      byIntent.get(intent.key).rows.push({ kind: 'pregunta', body: `Pregunta: ${row.question}\nRespuesta: ${row.answer}` });
    }
    for (const { intent, rows: asked } of byIntent.values()) {
      const team = teamAnswer(asked, intent);
      if (!team || team.varied || team.uses < minUses) continue;
      const product = shortProduct(titles[itemId] || '') || baseProduct([titles[itemId] || '']);
      const question = `${intent.label} (${intent.search.join(', ')})`;
      const key = `${product.toLowerCase()}|${question.toLowerCase()}`;
      if (!product || known.has(key)) continue;
      out.push({ id: `${itemId}-${intent.key}`, title: titles[itemId] || '', titles: [titles[itemId] || ''], product, question, answer: team.text, uses: team.uses, total: team.total, signature: `${intent.key}|${answerSignature(team.text)}` });
    }
  }
  // 22/10 (Felipe: "la resina epoxi rinde lo que rinde, pero me aparece en 700 g, 450 g y 25 kg"): la misma
  // respuesta del mismo tema en variantes de un producto (otro peso, otro tamaño) se muestra una sola vez.
  const groups = new Map();
  for (const entry of out) {
    const group = groups.get(entry.signature);
    if (!group) { groups.set(entry.signature, { ...entry }); continue; }
    group.titles.push(...entry.titles);
    group.uses += entry.uses;
    group.total += entry.total;
    if (entry.answer.length < group.answer.length) group.answer = entry.answer;
  }
  return [...groups.values()].map(({ signature, ...entry }) => {
    if (entry.titles.length < 2) return entry;
    const product = baseProduct(entry.titles) || entry.product;
    return { ...entry, product, title: `${entry.titles.length} variantes: ${entry.titles.slice(0, 3).join(' · ')}${entry.titles.length > 3 ? '…' : ''}` };
  })
    .filter((entry) => !known.has(`${entry.product.toLowerCase()}|${entry.question.toLowerCase()}`))
    .sort((a, b) => b.uses - a.uses).slice(0, max);
}

// Mismo dato aunque esté escrito distinto: los números con su unidad, o el texto sin signos.
function answerSignature(text = '') {
  const numbers = quantities(text).join(' | ');
  return numbers || String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Lo que comparten los títulos de las variantes, sin pesos ni medidas ("Resina Epoxi Cristal 700 Gr" y
// "Resina Epoxi Cristal 25 Kg" → "Resina Epoxi Cristal"). Con un solo título, sus primeras palabras.
const SIZE_WORD = /\d|^(x|kg|kgs|kilos?|gr|grs|gramos|g|lt|lts|litros?|ml|cc|cm|mm|m2|mts?|unidades?|pack|kit|de|con|por|para|envio|gratis)$/i;
export function baseProduct(titleList = []) {
  const lists = titleList.map((title) => String(title).split(/\s+/).filter((word) => word && !SIZE_WORD.test(word)));
  if (!lists.length || !lists[0].length) return '';
  const common = [];
  for (let index = 0; index < 3; index += 1) {
    const word = lists[0][index];
    if (!word || !lists.every((list) => (list[index] || '').toLowerCase() === word.toLowerCase())) break;
    common.push(word);
  }
  if (common.length) return common.join(' ');
  const shared = lists[0].filter((word) => lists.every((list) => list.some((other) => other.toLowerCase() === word.toLowerCase())));
  return shared.slice(0, 3).join(' ');
}

// "Preguntas sin buena respuesta" (22/10, Felipe: "que el sistema aprenda de sí mismo"): si la IA contesta
// que no tiene el dato, deriva a alguien o usa conocimiento general, se anota sola para que Felipe la
// enseñe. Así lo que falta cargar aparece sin esperar a que alguien vote 👎.
const GAP = [
  /dato general/i,
  /no (lo )?(tengo|tenemos|encuentro|encontr[eé]|figura|aparece|est[aá] (cargad|en el contexto)|hay (datos?|informaci))/i,
  /(el contexto|el crm) no (trae|tiene|incluye|dice)/i,
  /(consult[aá]|preguntale|confirm[aá]) (con|a) (juan|ezequiel|brenda|yuliani|david)/i,
];
export function answerHasGap(text = '') {
  return GAP.some((pattern) => pattern.test(String(text)));
}
