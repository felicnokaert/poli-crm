// Redacción con IA de respuestas validadas (10/11, Felipe con crédito de Anthropic hasta el 25/11): toma lo que el equipo
// ya respondió en Mercado Libre para un MISMO producto y tema, y la IA lo junta en una sola respuesta limpia. NO inventa:
// si las respuestas se contradicen o no alcanzan, lo marca. Nada se guarda sin que Felipe lo apruebe.
import { cleanAnswer, detectIntent, teamAnswer } from './assistant-answer.mjs';
import { baseProduct, shortProduct, worthTeaching } from './assistant-training.mjs';

const norm = (text = '') => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Grupos (producto + tema) con 2 o más respuestas distintas del equipo que las sugeridas sin IA NO cubren
// (las que se repiten 3+ veces iguales ya salen en «Ver respuestas sugeridas»). Primero los más preguntados.
export function draftCandidates(questions = [], titles = {}, { taught = [], max = 20, maxPairs = 8 } = {}) {
  const known = new Set(taught.map((entry) => `${norm(entry.product)}|${norm(entry.question)}`));
  const groups = new Map();
  for (const row of questions) {
    if (!row?.item_id || !String(row.answer || '').trim() || !worthTeaching(row.answer)) continue;
    const intent = detectIntent(row.question);
    if (!intent) continue;
    const product = shortProduct(titles[row.item_id] || '');
    if (!product) continue;
    const key = `${norm(product)}|${intent.key}`;
    if (!groups.has(key)) groups.set(key, { intent, product, titles: new Set(), pairs: [], seen: new Set() });
    const group = groups.get(key);
    const answer = cleanAnswer(row.answer);
    if (!answer || group.seen.has(norm(answer))) continue;
    group.seen.add(norm(answer));
    group.titles.add(titles[row.item_id] || '');
    group.pairs.push({ question: String(row.question || '').replace(/\s+/g, ' ').trim().slice(0, 300), answer: answer.slice(0, 700) });
  }
  const out = [];
  for (const [key, group] of groups) {
    if (group.pairs.length < 2) continue;
    const team = teamAnswer(group.pairs.map((pair) => ({ kind: 'pregunta', body: `Pregunta: ${pair.question}\nRespuesta: ${pair.answer}` })), group.intent);
    if (team && !team.varied && team.uses >= 3) continue; // ya la cubre «Ver respuestas sugeridas»
    const product = baseProduct([...group.titles]) || group.product;
    const question = `${group.intent.label} (${group.intent.search.join(', ')})`;
    if (known.has(`${norm(product)}|${norm(question)}`) || known.has(`${norm(group.product)}|${norm(question)}`)) continue;
    out.push({ id: key, product, question, intent: group.intent.label, titles: [...group.titles].slice(0, 4), pairs: group.pairs.slice(0, maxPairs), total: group.pairs.length });
  }
  return out.sort((a, b) => b.total - a.total).slice(0, max);
}
