// Contexto para la respuesta sugerida de WhatsApp (29/10): lo que el CRM ya sabe de la conversación, en líneas cortas.
// Solo trae lo verificado: los campos técnicos pendientes de validar NO se mandan, para que la IA no los invente.
const PENDING = (value) => !value || /pendiente/i.test(String(value));

export function buildReplyContext(suggestion = {}) {
  const lines = [];
  if (suggestion.family) lines.push(`Familia de producto detectada: ${suggestion.family}`);
  if (suggestion.intent) lines.push(`Intención del cliente: ${suggestion.intent}`);
  if (suggestion.isFollowUp) lines.push('Es un seguimiento: ya hubo mensajes antes, no pidas de nuevo lo que ya dijo.');
  if (suggestion.isClosingMessage) lines.push('Parece un cierre o un agradecimiento: respondé breve y cordial, sin pedir datos.');
  const missing = suggestion.missingQuestions || [];
  if (missing.length) lines.push('PREGUNTAS QUE FALTAN (elegí una o dos):', ...missing.map((question) => `- ${question}`));
  const cited = Object.entries(suggestion.technicalFields || {}).filter(([, value]) => !PENDING(value));
  if (cited.length) lines.push('Datos de una ficha vigente y validada:', ...cited.map(([field, value]) => `- ${field}: ${value}`));
  const docs = suggestion.recommendedDocs || [];
  if (docs.length) lines.push(`Fichas disponibles para mandarle: ${docs.map((doc) => doc.product).filter(Boolean).slice(0, 4).join(', ')}`);
  return lines.join('\n');
}
