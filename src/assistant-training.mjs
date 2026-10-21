// Prueba del asistente con preguntas reales de Mercado Libre (21/10, pedido de Felipe: "probá y entrená a la
// IA con las mismas preguntas de Mercado Libre"). Se toma una pregunta ya respondida, se le pasa a la IA lo
// que el equipo respondió en OTRAS preguntas de esa misma publicación (la respuesta real queda afuera) y se
// compara con lo que respondimos de verdad. Si la IA le erra, Felipe le enseña la respuesta correcta.
import { buildAiContext, cleanAnswer, detectIntent, guideFacts, teamAnswer } from './assistant-answer.mjs';

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
