// Ficha del producto desde Mercado Libre (23/10, OK de Felipe): para cada producto del catálogo vinculado por
// SKU, la descripción de la publicación que más vendió y las preguntas frecuentes con la respuesta que el
// equipo más repite (misma lógica que el asistente: teamAnswer). Sirve para pegar en Shopify o en la ficha
// del cotizador. Solo lee; no cambia nada en Mercado Libre ni en el catálogo.
import { detectIntent, teamAnswer } from './assistant-answer.mjs';

// Envíos, retiro y medidas de la publicación son propios de cada canal: no van a la ficha.
const SKIP = new Set(['envios']);
const MIN_QUESTIONS = 2;

const cleanDescription = (text) => String(text || '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// La pregunta "típica" del grupo: la más corta que se entiende sola.
const typical = (questions) => questions.map((text) => String(text).trim()).filter((text) => text.length >= 12).sort((a, b) => a.length - b.length)[0] || questions[0];

export function productMlSheet({ items = [], questions = [], descriptions = {}, maxFaq = 6 } = {}) {
  const sorted = [...items].sort((a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0));
  const source = sorted.find((item) => cleanDescription(descriptions[item.id]).length > 40) || null;
  const ids = new Set(items.map((item) => String(item.id)));
  const byIntent = new Map();
  for (const row of questions) {
    if (!ids.has(String(row.item_id)) || !row.question || !row.answer) continue;
    const intent = detectIntent(row.question);
    if (!intent || SKIP.has(intent.key)) continue;
    if (!byIntent.has(intent.key)) byIntent.set(intent.key, { intent, rows: [] });
    byIntent.get(intent.key).rows.push(row);
  }
  const faq = [];
  for (const { intent, rows } of byIntent.values()) {
    if (rows.length < MIN_QUESTIONS) continue;
    const answer = teamAnswer(rows.map((row) => ({ kind: 'pregunta', body: `${row.question}\nRespuesta: ${row.answer}` })), intent);
    if (!answer?.text) continue;
    faq.push({ key: intent.key, label: intent.label, question: typical(rows.map((row) => row.question)), answer: answer.text, uses: answer.uses, asked: rows.length });
  }
  faq.sort((a, b) => b.asked - a.asked);
  return { description: source ? cleanDescription(descriptions[source.id]) : '', sourceItem: source, faq: faq.slice(0, maxFaq) };
}

// Texto para copiar (Shopify, cotizador): descripción + preguntas frecuentes.
export function sheetText(name, sheet) {
  const parts = [String(name || '').trim()];
  if (sheet.description) parts.push(sheet.description);
  if (sheet.faq.length) parts.push(['Preguntas frecuentes', ...sheet.faq.map((entry) => `• ${entry.question}\n${entry.answer}`)].join('\n\n'));
  return parts.filter(Boolean).join('\n\n');
}
