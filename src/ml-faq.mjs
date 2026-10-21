// Preguntas que se repiten y no están en la descripción (21/10; consejo del asistente de Mercado Libre: "si una
// consulta frecuente se repite, agregá esa respuesta a la descripción"). Por publicación activa y tema, si el
// equipo respondió lo mismo 3+ veces y la descripción no habla de ese tema, se sugiere sumarlo. Solo sugiere:
// no cambia nada en Mercado Libre.
import { plain } from './knowledge-search.mjs';
import { detectIntent, teamAnswer } from './assistant-answer.mjs';

const mentions = (description, intent) => {
  const text = ` ${plain(description)} `;
  return [...intent.line, ...intent.search].some((word) => text.includes(plain(word)));
};

export function descriptionGaps(items = [], questions = [], { minUses = 3, max = 40 } = {}) {
  const byItem = new Map();
  for (const row of questions) {
    if (!row?.item_id || !String(row.answer || '').trim()) continue;
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, []);
    byItem.get(row.item_id).push(row);
  }
  const out = [];
  for (const item of items) {
    if (item.status !== 'active') continue;
    const rows = byItem.get(item.id) || [];
    if (rows.length < minUses) continue;
    const byIntent = new Map();
    for (const row of rows) {
      const intent = detectIntent(row.question);
      if (!intent) continue;
      if (!byIntent.has(intent.key)) byIntent.set(intent.key, { intent, rows: [] });
      byIntent.get(intent.key).rows.push({ kind: 'pregunta', body: `Pregunta: ${row.question}\nRespuesta: ${row.answer}` });
    }
    const missing = [];
    for (const { intent, rows: asked } of byIntent.values()) {
      if (asked.length < minUses || mentions(item.description || '', intent)) continue;
      const team = teamAnswer(asked, intent);
      missing.push({ key: intent.key, label: intent.label, asked: asked.length, answer: team && !team.varied ? team.text : '' });
    }
    if (missing.length) out.push({ id: item.id, title: item.title, permalink: item.permalink, seller_id: item.seller_id, missing: missing.sort((a, b) => b.asked - a.asked), asked: missing.reduce((sum, entry) => sum + entry.asked, 0) });
  }
  return out.sort((a, b) => b.asked - a.asked).slice(0, max);
}

// Texto listo para pegar al final de la descripción.
export function faqText(gap) {
  return ['PREGUNTAS FRECUENTES', ...gap.missing.filter((entry) => entry.answer).map((entry) => `• ${entry.label}: ${entry.answer}`)].join('\n');
}
