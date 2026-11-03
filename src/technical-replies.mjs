// Respuestas técnicas para WhatsApp (3/11, Felipe: «las respuestas técnicas, perfecto»): por producto y tema, lo que el equipo
// ya contestó en Mercado Libre (la respuesta que más repetimos) y lo que Felipe enseñó (assistant_knowledge). No inventa nada:
// si no hay datos suficientes lo dice, y las respuestas distintas se muestran para elegir. Envíos queda afuera (depende del caso).
import { INTENTS, matchTaught, mlQuery, teamAnswer } from './assistant-answer.mjs';

export const TECH_TOPICS = INTENTS.filter((intent) => intent.key !== 'envios').map((intent) => ({ key: intent.key, label: intent.label }));

export const searchText = (product, topicKey) => {
  const intent = INTENTS.find((item) => item.key === topicKey);
  return { intent, q: intent ? mlQuery(`${String(product || '').trim()} ${intent.ask[0]}`, intent) : '' };
};

// rows: resultado de search_ml_knowledge; taught: filas de assistant_knowledge (sin reglas).
export function technicalAnswer({ rows = [], taught = [], product = '', topicKey = '' } = {}) {
  const intent = INTENTS.find((item) => item.key === topicKey);
  if (!intent || !String(product).trim()) return { taught: [], team: null };
  const plain = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const topicWords = [...intent.ask, ...(intent.line || [])].map(plain).filter((word) => word.length > 3);
  // Lo enseñado: primero por producto y después se queda con lo que habla del tema pedido.
  const onTopic = (entry) => { const text = plain(`${entry.question} ${entry.answer}`); return topicWords.some((word) => text.includes(word)); };
  return {
    taught: matchTaught((taught || []).filter((entry) => entry.product !== 'regla'), String(product).trim(), { max: 6 }).filter(onTopic).slice(0, 2),
    team: teamAnswer(rows || [], intent),
  };
}

// Texto listo para pegar en WhatsApp: la respuesta y una pregunta para seguir la charla.
export function whatsappText(answer, { nombre = '' } = {}) {
  const hi = nombre ? `Hola ${nombre}, ` : 'Hola, ';
  return `${hi}${String(answer || '').trim()}\n\n¿Para qué lo vas a usar? Así te confirmo la mejor opción.`;
}
