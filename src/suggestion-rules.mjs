// Motor de sugerencias determinístico para el copiloto de ventas.
//
// Fase 1 (07/09/2026): ningún documento de technical-library.mjs fue leído
// completo ni validado por Poliplast todavía — solo tenemos su nombre y
// carpeta. Por eso este motor NUNCA afirma un dato técnico (rendimiento,
// compatibilidad, aplicación, dosificación, seguridad, precio, stock) solo
// porque el nombre de una ficha lo sugiere. Esos campos quedan explícitos
// como "pendiente de verificar" hasta que exista contenido validado.
//
// Lo que sí puede hacer con reglas simples y sin inventar nada:
//   - detectar familia e intención a partir de palabras clave;
//   - sugerir qué preguntas faltan para avanzar la venta;
//   - proponer el próximo paso;
//   - recomendar qué ficha técnica consultar (solo el nombre, no su contenido);
//   - redactar un mensaje con copy comercial genérico ya aprobado.
import { inferIntent } from './commercial-intelligence.mjs';
import { documentsForFamily, docTypeLabel } from './technical-library.mjs';

// Mismas reglas de familia que usa la clasificación manual en App.jsx
// (draftFromWhatsApp) — repetidas acá a propósito, como módulo propio y
// testeado, para no tocar App.jsx en esta fase.
const FAMILY_RULES = [
  ['Penosil', ['penosil', 'easyspray', 'espuma aerosol']],
  ['Poliurea', ['poliurea']],
  ['Poliuretano', ['poliuretano', 'espuma rígida', 'espuma rigida', 'aislación', 'aislacion']],
  ['PURMAC', ['purmac', 'máquina', 'maquina', 'repuesto']],
  ['PRFV', ['prfv', 'fibra de vidrio', 'resina poliéster', 'resina poliester']],
  ['Carrozados', ['carrozado', 'furgón', 'furgon']],
  ['Resinplast', ['resinplast']],
  ['Imperpur', ['imperpur', 'impermeabil']],
];

const URGENT_WORDS = /hoy|urgente|mañana|manana|esta semana|para el viernes|cuanto antes/;
const COMMERCIAL_WORDS = /precio|cotiz|comprar|necesito|kg|litros|unidades|cantidad|stock/;
const GENERIC_INFO_WORDS = /m[aá]s informaci[oó]n|informaci[oó]n sobre esto|info sobre esto|quisiera informaci[oó]n|quiero saber m[aá]s/;

// Campos técnicos que este motor jamás completa con un valor inventado.
export const PENDING_TECHNICAL_FIELDS = ['rendimiento', 'compatibilidad', 'aplicación', 'dosificación', 'seguridad', 'precio', 'stock'];
const PENDING_LABEL = 'Pendiente de verificar (sin ficha validada)';

// Preguntas base por familia — para completar el diagnóstico comercial, no
// afirman ningún dato técnico, solo piden la información que falta.
const MISSING_QUESTIONS_BY_FAMILY = {
  Penosil: ['¿Qué aplicación específica necesita (sellado, pegado, espuma de relleno)?', '¿Sobre qué superficie va a aplicarse?', '¿Qué cantidad aproximada necesita?', '¿Para cuándo lo necesita?'],
  Poliurea: ['¿Qué superficie va a recubrir?', '¿Qué m² aproximados tiene el proyecto?', '¿Es una aplicación nueva o un mantenimiento?'],
  Poliuretano: ['¿Es para aislación térmica, acústica o flotación?', '¿Qué superficie o volumen aproximado necesita cubrir?', '¿Aplicación en obra nueva o reforma?'],
  PURMAC: ['¿Qué máquina o repuesto puntual está buscando?', '¿Para qué tipo de aplicación la va a usar?', '¿Tiene el modelo o número de serie del equipo actual, si es un repuesto?'],
  PRFV: ['¿Qué pieza o estructura necesita fabricar o reparar?', '¿Qué cantidad aproximada de resina necesita?'],
  Carrozados: ['¿Qué tipo de vehículo o furgón es?', '¿Qué medidas tiene el espacio a carrozar?'],
  Resinplast: ['¿Para qué superficie o proyecto es la resina?', '¿Qué cantidad aproximada necesita?'],
  Imperpur: ['¿Qué superficie necesita impermeabilizar?', '¿Cuántos m² aproximados?'],
  'Sin definir': ['¿Qué producto o familia le interesa?', '¿Cuál es la aplicación que tiene en mente?'],
};

const GENERIC_NEXT_ACTION = 'Revisar conversación de WhatsApp';

function detectFamily(text, channel) {
  const lower = text.toLowerCase();
  const genericInfo = GENERIC_INFO_WORDS.test(lower);
  const penosilOpening = channel === 'penosil' && genericInfo;
  const match = FAMILY_RULES.find(([, words]) => words.some((word) => lower.includes(word)));
  if (match) return { family: match[0], provenance: 'regla_aprobada' };
  if (penosilOpening) return { family: 'Penosil', provenance: 'regla_aprobada' };
  return { family: 'Sin definir', provenance: 'regla_aprobada' };
}

function detectTemperature(text) {
  const lower = text.toLowerCase();
  const urgent = URGENT_WORDS.test(lower);
  const commercial = COMMERCIAL_WORDS.test(lower) || GENERIC_INFO_WORDS.test(lower);
  if (urgent && commercial) return 'Caliente';
  if (commercial) return 'Tibio';
  return 'Frío';
}

function pendingTechnicalFields() {
  return Object.fromEntries(PENDING_TECHNICAL_FIELDS.map((field) => [field, PENDING_LABEL]));
}

function buildDraftMessage({ family, missingQuestions, recommendedDocs }) {
  const lines = [
    'Gracias por escribirnos. Para ayudarte de la forma más precisa posible, necesitamos confirmar algunos datos antes de recomendarte un producto:',
    ...missingQuestions.map((question) => `- ${question}`),
  ];
  if (recommendedDocs.length > 0) {
    lines.push('', `Ficha técnica de referencia para ${family} (a confirmar internamente antes de citar datos puntuales): ${recommendedDocs.map((doc) => `${doc.product} (${docTypeLabel(doc.docType)})`).join(', ')}.`);
  }
  lines.push('', `Rendimiento, compatibilidad, aplicación, dosificación, seguridad, precio y stock: ${PENDING_LABEL}.`);
  return lines.join('\n');
}

// event: { channel, text_body, customer_name }
export function buildSuggestion(event = {}) {
  const text = String(event?.text_body || '').trim();
  const channel = event?.channel || '';
  const { family, provenance: familyProvenance } = detectFamily(text, channel);
  const intent = inferIntent(text);
  const temperature = detectTemperature(text);
  const missingQuestions = MISSING_QUESTIONS_BY_FAMILY[family] || MISSING_QUESTIONS_BY_FAMILY['Sin definir'];
  const recommendedDocs = documentsForFamily(family).map((doc) => ({ id: doc.id, product: doc.product, docType: doc.docType, sourceFile: doc.sourceFile, verified: doc.verified }));
  const nextAction = family === 'Sin definir' ? GENERIC_NEXT_ACTION : 'Responder confirmando los datos faltantes y citar la ficha técnica correspondiente una vez validada';

  return {
    family,
    intent,
    temperature,
    missingQuestions,
    nextAction,
    recommendedDocs,
    technicalFields: pendingTechnicalFields(),
    draftMessage: buildDraftMessage({ family, missingQuestions, recommendedDocs }),
    provenance: {
      family: familyProvenance,
      intent: 'regla_aprobada',
      temperature: 'regla_aprobada',
      missingQuestions: 'regla_aprobada',
      nextAction: 'regla_aprobada',
      recommendedDocs: recommendedDocs.length > 0 ? 'metadata_ficha' : 'regla_aprobada',
      technicalFields: 'pendiente_de_validacion',
      draftMessage: 'regla_aprobada',
    },
  };
}
