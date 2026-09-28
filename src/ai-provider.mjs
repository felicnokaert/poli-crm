// Interfaz agnóstica de proveedor de IA para el copiloto de ventas.
//
// Fase 1 (07/09/2026): no hay ninguna cuenta ni API key de pago conectada,
// a pedido explícito de Felipe. Este módulo no hace ninguna llamada de red
// y no lee ningún secreto — existe solo para que, el día que se autorice un
// costo, conectar Anthropic/OpenAI/un modelo local sea agregar un adapter
// acá, sin tocar el resto del CRM.
export const AI_PROVIDERS = ['none', 'anthropic', 'openai', 'local'];

// Fase 1: siempre 'none'. Cuando Felipe autorice un proveedor pago, esta
// función pasa a leer una variable de entorno (ej. AI_PROVIDER) en vez de
// devolver un valor fijo.
export function getActiveProvider() {
  return 'none';
}

export function isProviderConfigured() {
  return getActiveProvider() !== 'none';
}

// No hace ninguna llamada de red. Si no hay proveedor configurado (siempre,
// en esta fase) devuelve un resultado explícito en vez de tirar una
// excepción genérica, para que la UI pueda mostrar el botón "Preparar
// consulta para IA" como alternativa manual sin costo.
export async function draftReplyWithProvider() {
  return { ok: false, provider: 'none', reason: 'Sin proveedor de IA configurado. Usá "Preparar consulta para IA" para copiar el contexto y pegarlo manualmente en Claude o ChatGPT.' };
}

// Arma el texto plano que el botón "Preparar consulta para IA" copia al
// portapapeles. Sin datos personales innecesarios (no incluye teléfono
// completo del cliente) y sin ningún secreto (no incluye tokens ni claves).
export function prepareManualQuery({ family, intent, temperature, missingQuestions = [], recommendedDocs = [], customerMessage = '' } = {}) {
  const lines = [
    'Contexto para redactar una respuesta comercial (Grupo Poliplast):',
    `Familia detectada: ${family || 'Sin definir'}`,
    `Intención detectada: ${intent || 'A confirmar'}`,
    `Temperatura: ${temperature || 'A confirmar'}`,
  ];
  if (customerMessage) lines.push('', 'Mensaje del cliente:', customerMessage);
  if (missingQuestions.length > 0) lines.push('', 'Preguntas que todavía faltan confirmar:', ...missingQuestions.map((q) => `- ${q}`));
  if (recommendedDocs.length > 0) lines.push('', 'Fichas técnicas de referencia (nombre solamente, contenido sin validar):', ...recommendedDocs.map((doc) => `- ${doc.product}`));
  lines.push('', 'No inventes rendimiento, compatibilidad, precio ni stock: si no está confirmado arriba, pedí ese dato en la respuesta.');
  return lines.join('\n');
}

// Palabras que no aportan nada a la búsqueda ("necesito un producto que sea
// resistente al agua" - sin este filtro "que"/"sea" pesarían igual que
// "resistente"/"agua"). Lista corta a propósito: mejor una palabra de más
// que perder una palabra clave real por un filtro demasiado agresivo.
const QUERY_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'que',
  'para', 'con', 'sin', 'por', 'y', 'o', 'a', 'en', 'es', 'sea', 'ser',
  'me', 'mi', 'necesito', 'necesita', 'quiero', 'busco', 'tiene', 'tenga',
  'producto', 'productos', 'cual', 'cuál', 'recomendas', 'recomendás',
  'recomienda', 'recomendame', 'recomiéndame',
]);

function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function queryTokens(question = '') {
  return [...new Set(
    normalizeSearchText(question)
      .split(/[^a-z0-9áéíóúñ]+/i)
      .filter((token) => token.length > 2 && !QUERY_STOPWORDS.has(token)),
  )];
}

// Cuenta cuántas veces aparece cada palabra de la pregunta en la ficha -
// título/familia/producto pesan más que el texto extraído completo (un
// match en el nombre del producto es una señal más fuerte que uno perdido
// en el medio de una hoja de datos técnica).
function scoreDocument(doc, tokens) {
  const titleText = normalizeSearchText([doc.title, doc.family, doc.product].filter(Boolean).join(' '));
  const bodyText = normalizeSearchText(doc.extractedText || '');
  let score = 0;
  for (const token of tokens) {
    if (titleText.includes(token)) score += 3;
    if (bodyText.includes(token)) score += 1;
  }
  return score;
}

// Recorta el texto extraído alrededor de la primera palabra de la pregunta
// que aparece en él, para no pegar la ficha entera en la consulta manual.
function relevantSnippet(doc, tokens) {
  const text = doc.extractedText || '';
  if (!text) return '';
  const normalized = normalizeSearchText(text);
  let hitIndex = -1;
  for (const token of tokens) {
    const index = normalized.indexOf(token);
    if (index !== -1 && (hitIndex === -1 || index < hitIndex)) hitIndex = index;
  }
  if (hitIndex === -1) return text.slice(0, 280).trim();
  const start = Math.max(0, hitIndex - 120);
  const end = Math.min(text.length, hitIndex + 280);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

// Busca, entre las fichas "vigentes" (las únicas que el copiloto puede citar
// - ver technical-document-governance.mjs), cuáles se relacionan con una
// pregunta libre en lenguaje natural ("qué producto me recomendás para
// aislar térmicamente una casilla rodante"). Ranking por palabras clave, sin
// IA - no hace ninguna llamada de red ni interpreta nada, solo cuenta
// coincidencias literales.
export function findRelevantDocuments(question = '', documents = [], { limit = 6 } = {}) {
  const tokens = queryTokens(question);
  if (!tokens.length) return [];
  return documents
    .filter((doc) => doc.status === 'vigente')
    .map((doc) => ({ doc, score: scoreDocument(doc, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ doc }) => ({ ...doc, snippet: relevantSnippet(doc, tokens) }));
}

// Arma el texto de "Preparar consulta para IA" de Base técnica: la pregunta
// del usuario + un extracto literal de cada ficha vigente relacionada, listo
// para pegar en Claude/ChatGPT. Nunca decide sola cuál es "la" recomendación
// - eso lo hace la IA (o la persona) que recibe este texto, con el dato real
// de cada ficha a la vista en vez de inventado.
export function prepareProductRecommendationQuery(question = '', documents = []) {
  const matches = findRelevantDocuments(question, documents);
  const lines = [
    'Consulta de recomendación de producto (Grupo Poliplast, Base técnica del CRM):',
    '',
    'Pregunta:',
    question || '(sin especificar)',
  ];
  if (matches.length > 0) {
    lines.push('', `Fichas técnicas vigentes y validadas que podrían aplicar (${matches.length}):`);
    for (const doc of matches) {
      lines.push('', `— ${doc.product || doc.title} (${doc.family})`);
      if (doc.snippet) lines.push(doc.snippet);
    }
  } else {
    lines.push('', 'No se encontró ninguna ficha vigente que coincida con palabras clave de esta pregunta - respondé solo con conocimiento general y avisá que no hay una ficha propia de Poliplast que lo respalde.');
  }
  lines.push('', 'Recomendá un producto concreto del listado de arriba si aplica. No inventes rendimiento, compatibilidad, dosificación, precio ni stock que no esté en los extractos de arriba - si falta un dato, decilo en vez de inventarlo.');
  return lines.join('\n');
}
