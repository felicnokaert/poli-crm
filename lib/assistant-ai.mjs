// Asistente con IA (21/10, preparado mientras se aprueban los créditos). Conversa con el equipo usando SOLO
// lo que el CRM encontró (guías, fichas, respuestas de Mercado Libre…), que arma el navegador con el mismo
// buscador del asistente. Regla de Felipe: la respuesta que más repetimos en Mercado Libre es la válida.
// La clave vive en Vercel (ANTHROPIC_API_KEY) y nunca sale del servidor. Sin clave, contesta
// { ok: false, reason: 'sin-clave' } y la ventana sigue funcionando como buscador, sin costo.
// Sin tope de preguntas por persona (pedido de Felipe): el límite es el crédito prepago de la cuenta.
import { authenticatedCorporateUser } from './corporate-auth.mjs';
import { OBJECTIONS } from '../src/commercial-knowledge.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { db } from './mercadolibre.mjs';
import { arToday } from '../src/ar-date.mjs';

// Tope diario por persona (4/11, revisión): el crédito de la empresa es compartido; los administradores (entrenamiento, evaluaciones) no tienen tope.
export const DAILY_AI_LIMIT = 150;
const USAGE_KEY = 'assistant-usage';
export async function countUsage(email, environment, http) {
  try {
    const store = db(environment, http);
    const day = arToday();
    const rows = await store.select(`crm_system_status?select=detail&key=eq.${USAGE_KEY}`);
    const detail = rows?.[0]?.detail || {};
    const counts = detail.day === day ? { ...(detail.counts || {}) } : {};
    counts[email] = (Number(counts[email]) || 0) + 1;
    await store.upsert('crm_system_status', [{ key: USAGE_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { day, counts } }]);
    return counts[email];
  } catch { return 0; } // si no se puede contar, no se frena a nadie
}

const API = 'https://api.anthropic.com/v1/messages';
export const ASSISTANT_MODEL = 'claude-haiku-5-5';
const MAX_CONTEXT = 14000; // caracteres de contexto por pregunta
const MAX_TURNS = 8; // mensajes anteriores de la charla que se mandan
const MAX_TEXT = 2000;

export const SYSTEM_PROMPT = [
  'Sos el asistente interno de Grupo Poliplast (Argentina): espumas y sistemas de poliuretano, poliurea, resinas epoxi y poliéster (Resinplast), impermeabilizantes (Imperpur), máquinas proyectoras PURMAC y repuestos.',
  'Le respondés a alguien del equipo de ventas, en español rioplatense, corto y concreto: primero la respuesta, después el detalle si hace falta.',
  'FORMA DE RESPONDER (22/10, Felipe: "tiene que responder mejor"): la primera línea es LA respuesta concreta, en **negrita** si es un dato (precio, rendimiento, tiempo, fecha, nombre). No repitas la pregunta, no cuentes dónde buscaste ni qué no encontraste antes de dar lo que sí hay, y no agregues "consultá con…" si ya tenés el dato. Después, solo si suma, 2 a 4 viñetas con el detalle útil para vender (presentaciones, cómo se usa, qué ofrecer junto). Tono de compañero que sabe, no de manual.',
  'Primero usá los datos del CONTEXTO que te pasa el CRM (son de Poliplast y mandan). Regla de la empresa: cuando el contexto trae "Respuesta del equipo en Mercado Libre" (la que más repetimos), esa es la respuesta válida aunque la ficha diga otra cosa; podés mencionar la diferencia.',
  'Si el contexto no alcanza, igual ayudá con tu conocimiento general (técnica de poliuretano, poliurea, epoxi, poliéster, impermeabilización, aplicación, seguridad, ventas, atención al cliente, Mercado Libre, uso de herramientas): marcalo con "Dato general (no es de Poliplast, conviene verificar)". Si es un dato de Poliplast que no está en el contexto, decilo y sugerí a quién consultar: máquinas, sistemas de poliuretano y repuestos → Juan; Resinplast e Imperpur → Ezequiel; tiendas online y consultas generales → Brenda.',
  'Nunca inventes precios, stock, plazos de entrega, clientes ni datos técnicos de NUESTROS productos (rendimiento, tiempos, dosificación, certificaciones) que no estén en el contexto. Si el contexto trae PRECIOS DE LISTA VIGENTES, respondé con esos números: el precio final (IVA incluido) y el neto + IVA, la lista (consumidor o mayorista) y desde qué cantidad; aclará en una línea que el cotizador puede ajustar por cantidad o forma de pago. Los precios de la memoria de ventas (lo que se le vendió a alguien) son + IVA.',
  'También ayudás a usar el CRM: si preguntan para qué sirve una pantalla o cómo hacer algo, respondé con la parte "Cómo usar el CRM" del contexto y decí dónde está en el menú.',
  'Si preguntan por un cliente (contacto, teléfono, mail, cuándo compró, qué se habló), usá Clientes, Contabilium, Ventas cargadas e Historial del contexto. Las tareas, ventas, historial y prospectos del contexto son de la persona que pregunta.',
  'Si te piden un texto para un cliente, escribilo listo para copiar por WhatsApp, cordial y sin firmar.',
  'Respondé completo pero sin relleno (hasta unas 200 palabras, salvo que pidan más). Podés usar **negrita** y viñetas con "- ".',
  'Sos un asistente que AYUDA A HACER, no solo responde: si la persona pide agendar, recordar, anotar o escribir un mensaje, usá las herramientas crear_tarea, anotar_en_cliente o redactar_mensaje (la persona confirma antes de que se guarde). Si conviene un próximo paso (llamar, cotizar, seguimiento), proponelo. Para planificar el día usá las tareas del contexto.',
  'Para "cuándo compró" o "última compra/factura" de un cliente mandan los comprobantes de Contabilium del contexto (son la fuente más actualizada). La "Última compra" de la ficha de Clientes es un dato cargado a mano y puede estar viejo: si difiere de Contabilium, usá la fecha más reciente de Contabilium y decí que la ficha está desactualizada. Si la persona nombra un número de comprobante y está en "Comprobantes de Contabilium que coinciden", respondé con ese dato (cliente, fecha, importe, saldo).',
  'Si la persona pide un resumen de un cliente, armalo completo: quién es y cómo contactarlo, qué compra y cuándo compró (Contabilium y Ventas), lo último que se habló, tareas abiertas y qué conviene hacer ahora.',
  'Si el contexto trae REGLAS DE LA EMPRESA, cumplilas siempre por encima de todo. Nunca le ofrezcas nada a un competidor ni lo recomiendes. Para recomendar un aplicador, usá solo la lista de la red RAPYP del contexto (la primera es el mejor cliente); si no está, decí que lo consulten con Juan o David.',
  'Nunca digas que no podés guardar o recordar algo: si la persona pide guardar una respuesta, proponela con guardar_respuesta (queda en el CRM para todos). Lo que se habló antes en esta charla sigue valiendo: no lo desmientas porque no aparezca otra vez en el contexto.',
  'Si el contexto trae "Lo que anotó el equipo", es la experiencia real de los comerciales con clientes: usala para responder (qué funcionó, qué objeciones hubo) y nombrá de qué cliente sale. Si falta el dato o hace falta una persona, decí a quién derivarlo según "A QUIÉN DERIVAR" y ofrecé crear la tarea para esa persona.',
  'Si el contexto trae la "Ficha de la publicación en Mercado Libre", usala para medidas, colores, presentación, contenido del kit y usos: es el dato real de lo que se vende.',
  'Si para contestar o calcular falta un dato del cliente (medidas, superficie, espesor, cantidad, para qué lo va a usar), NO lo supongas ni hagas cuentas con valores inventados: pedíselo al cliente con una pregunta corta, como haría el equipo, y dejá escrito qué preguntarle. Después, si corresponde, decí a quién consultar.',
  'No cuestiones ni desaconsejes la respuesta del equipo en Mercado Libre con tu criterio: si es la que más repetimos, es la válida. Si dos respuestas de Mercado Libre se contradicen, decilo en una línea y pedí que se confirme, sin elegir una por tu cuenta ni deducir un número que no esté escrito.',
  'Terminá con una línea corta "Fuente: …" (guía, ficha, Mercado Libre, lista de precios, CRM o conocimiento general), sin explicar más.',
].join('\n');

// Acciones que el asistente puede PROPONER (22/10, Felipe: "que realmente sea un asistente y no un saca
// dudas"). La IA no ejecuta nada: devuelve la propuesta, la ventana la muestra y la persona confirma con un
// toque. Mandar mensajes no existe como acción: solo se redacta el texto para copiar (regla del CRM).
export const ASSISTANT_TOOLS = [
  {
    name: 'crear_tarea',
    description: 'Proponer una tarea para la agenda de la persona (llamar, cotizar, hacer seguimiento, visitar). Usala cuando la persona pide que le recuerdes o agendes algo, o cuando acordaron un próximo paso.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Qué hay que hacer, corto. Ej.: "Llamar para ofrecer Easyspray"' },
        empresa: { type: 'string', description: 'Cliente o empresa, si hay' },
        fecha: { type: 'string', description: 'Fecha límite AAAA-MM-DD (calculala desde HOY)' },
        prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
      },
      required: ['titulo', 'fecha'],
    },
  },
  {
    name: 'anotar_en_cliente',
    description: 'Proponer una nota en la ficha de un cliente que ya está en la cartera (qué se habló, qué necesita, un dato importante).',
    input_schema: {
      type: 'object',
      properties: {
        empresa: { type: 'string', description: 'Nombre del cliente tal como figura en el contexto' },
        nota: { type: 'string', description: 'La nota, corta y concreta' },
      },
      required: ['empresa', 'nota'],
    },
  },
  {
    name: 'redactar_mensaje',
    description: 'Redactar un mensaje listo para copiar y mandar por WhatsApp o mail (el CRM no lo envía).',
    input_schema: {
      type: 'object',
      properties: {
        para: { type: 'string', description: 'A quién va (cliente o compañero)' },
        texto: { type: 'string', description: 'El mensaje completo, cordial, sin firmar' },
      },
      required: ['texto'],
    },
  },
  {
    name: 'guardar_respuesta',
    description: 'Guardar una respuesta en el conocimiento del CRM para que el asistente la use siempre (para todo el equipo). Usala cuando la persona pide "guardala", "acordate", "aprendé esto" o confirma que una respuesta está bien. Si quien pide es Felipe queda validada; si no, le llega a Felipe para aprobar.',
    input_schema: {
      type: 'object',
      properties: {
        pregunta: { type: 'string', description: 'La pregunta como la haría un cliente o un vendedor. Ej.: "¿Cuánto rinde el Easyspray en otro espesor?"' },
        producto: { type: 'string', description: 'Producto corto, si es de uno (ej. "Easy Spray"); vacío si es general' },
        respuesta: { type: 'string', description: 'La respuesta completa y concreta, tal como se acordó en la charla, sin "Fuente:"' },
      },
      required: ['pregunta', 'respuesta'],
    },
  },
];

// Lo que la IA propuso hacer, ya validado para mostrar en la ventana.
export function actionsFrom(content = []) {
  return (Array.isArray(content) ? content : [])
    .filter((part) => part?.type === 'tool_use' && ASSISTANT_TOOLS.some((tool) => tool.name === part.name))
    .map((part) => ({ id: String(part.id || ''), kind: part.name, input: part.input && typeof part.input === 'object' ? part.input : {} }))
    .filter((action) => (action.kind === 'crear_tarea' ? action.input.titulo : action.kind === 'anotar_en_cliente' ? action.input.empresa && action.input.nota : action.kind === 'guardar_respuesta' ? action.input.pregunta && action.input.respuesta : action.input.texto));
}

const clip = (value, max) => String(value ?? '').slice(0, max);

export function buildMessages({ question, context = '', history = [] } = {}) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((turn) => (turn?.role === 'user' || turn?.role === 'assistant') && String(turn.text || '').trim())
    .slice(-MAX_TURNS)
    .map((turn) => ({ role: turn.role, content: clip(turn.text, MAX_TEXT) }));
  // La charla tiene que empezar por el usuario y alternar.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const merged = [];
  for (const turn of turns) {
    if (merged.length && merged.at(-1).role === turn.role) merged.at(-1).content += `\n${turn.content}`;
    else merged.push({ ...turn });
  }
  if (merged.length && merged.at(-1).role === 'user') merged.pop();
  merged.push({ role: 'user', content: `CONTEXTO (lo que encontró el CRM):\n${clip(context, MAX_CONTEXT) || '(no encontró nada)'}\n\nPREGUNTA: ${clip(question, MAX_TEXT)}` });
  return merged;
}

// Práctica (22/10, Academia → Práctica): la IA hace de CLIENTE para que el vendedor ensaye. El escenario viene
// en "context"; "EVALUAR" la hace salir del personaje y puntuar con el método E-C-E-R-A. Sin herramientas.
export const PRACTICE_PROMPT = [
  'Sos un CLIENTE argentino de Grupo Poliplast en un ensayo de ventas. El vendedor te escribe por WhatsApp.',
  'Respondé SOLO como ese cliente: 1 a 3 frases, natural, sin ayudar al vendedor ni darle la respuesta.',
  'Sostené la objeción del escenario. Si el vendedor escucha, confirma, pregunta por la causa real y propone un próximo paso concreto, cedé de a poco; si se defiende, baja el precio de entrada o no pregunta, mantenete firme.',
  'Nunca inventes datos técnicos de Poliplast: si te los da el vendedor, reaccioná a eso.',
  'Si el vendedor escribe EVALUAR, salí del personaje y evaluá la charla con el método E-C-E-R-A (Escuchar, Confirmar, Explorar, Responder, Acordar): qué hizo bien, qué mejorar con un ejemplo de frase, y una nota de 1 a 10. Usá **negrita** y viñetas.',
].join('\n');

export function buildPracticeMessages({ question, history = [] } = {}) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((turn) => (turn?.role === 'user' || turn?.role === 'assistant') && String(turn.text || '').trim())
    .slice(-MAX_TURNS)
    .map((turn) => ({ role: turn.role, content: clip(turn.text, MAX_TEXT) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const merged = [];
  for (const turn of turns) {
    if (merged.length && merged.at(-1).role === turn.role) merged.at(-1).content += `\n${turn.content}`;
    else merged.push({ ...turn });
  }
  if (merged.length && merged.at(-1).role === 'user') merged.pop();
  merged.push({ role: 'user', content: clip(question, MAX_TEXT) });
  return merged;
}

// Respuesta sugerida para una conversación de WhatsApp (29/10, etapa 1 de Felipe): BORRADOR bajo demanda, nunca se envía solo.
// La persona lo edita, lo copia y lo manda ella. Solo usa lo que trae el contexto; lo que falta lo pregunta.
// Juez (3/11): compara la respuesta de la IA con la que dio el equipo de verdad, para medir cuánto acierta sin que Felipe lea una por una.
// Devuelve un veredicto y un motivo corto. Sin herramientas y con pocos tokens: cada juicio cuesta una fracción de centavo.
export const JUDGE_PROMPT = [
  'Sos un corrector de respuestas de atención al cliente de Poliplast (poliuretano, resinas, espumas, pinturas).',
  'Te paso la PREGUNTA de un cliente, la RESPUESTA REAL del equipo y la RESPUESTA DE LA IA. Decidí si la respuesta de la IA le sirve igual que la real.',
  'Mirá solo los DATOS (cantidades, tiempos, rendimientos, medidas, compatibilidades, si se puede o no): ignorá saludos, estilo y largo.',
  'Veredictos: "correcta" (los datos clave coinciden o la IA aporta lo mismo), "parcial" (acierta algo pero falta o se desvía un dato importante), "incorrecta" (contradice a la real o da un dato distinto), "sin-dato" (la IA dice que no tiene el dato o no contesta lo preguntado).',
  'La respuesta real puede ser corta o incompleta: si la IA agrega información que no contradice a la real, sigue siendo "correcta".',
  'Contestá SOLO un JSON en una línea: {"veredicto":"correcta|parcial|incorrecta|sin-dato","motivo":"una frase de hasta 20 palabras"}.',
].join('\n');

// Redactor (10/11): junta respuestas reales del equipo en UNA sola, sin agregar datos. Solo para que Felipe revise y apruebe.
export const DRAFT_PROMPT = [
  'Sos un editor de conocimiento de Poliplast (poliuretano, resinas, espumas, pinturas). Te paso PREGUNTAS de clientes y las RESPUESTAS REALES que dio el equipo sobre un mismo producto y tema.',
  'Escribí UNA respuesta corta (hasta 60 palabras), clara y lista para contestarle a un cliente, usando SOLO datos que estén en esas respuestas. No agregues números, tiempos, medidas ni compatibilidades que no figuren. Sin links, teléfonos ni mails. Sin saludos.',
  'Si las respuestas se CONTRADICEN en un dato importante (otro número o un sí/no distinto), no elijas: estado "conflicto" y en "nota" decí qué difiere (ej. "unas dicen 1 kg/m², otras 5 kg/m²").',
  'Si no alcanzan para contestar el tema (respuestas vagas, de otro producto o dependen del caso), estado "insuficiente".',
  'Contestá SOLO un JSON en una línea: {"estado":"clara|conflicto|insuficiente","respuesta":"texto o vacío","nota":"una frase de hasta 25 palabras"}.',
].join('\n');

export function buildDraftMessages({ product = '', topic = '', pairs = [] } = {}) {
  const list = (Array.isArray(pairs) ? pairs : []).slice(0, 10).map((pair, index) => `${index + 1}) Pregunta: ${clip(pair?.question, 300)}\n   Respuesta del equipo: ${clip(pair?.answer, 700)}`).join('\n');
  return [{ role: 'user', content: `PRODUCTO: ${clip(product, 120)}\nTEMA: ${clip(topic, 120)}\n\n${list}` }];
}

const DRAFT_STATES = ['clara', 'conflicto', 'insuficiente'];
export function parseDraft(text = '') {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const data = JSON.parse(match[0]);
      const state = String(data.estado || '').toLowerCase().trim();
      if (DRAFT_STATES.includes(state)) {
        const answer = clip(String(data.respuesta || '').replace(/https?:\/\/\S+/g, '').trim(), 600);
        return { state: state === 'clara' && !answer ? 'insuficiente' : state, answer: state === 'clara' ? answer : '', note: clip(data.nota, 240) };
      }
    } catch { /* sigue abajo */ }
  }
  return { state: 'insuficiente', answer: '', note: 'La IA no devolvió un formato claro: revisalo a mano.' };
}

const VERDICTS = ['correcta', 'parcial', 'incorrecta', 'sin-dato'];

export function buildJudgeMessages({ question = '', realAnswer = '', aiAnswer = '' } = {}) {
  return [{ role: 'user', content: `PREGUNTA: ${clip(question, 600)}\n\nRESPUESTA REAL DEL EQUIPO:\n${clip(realAnswer, 1500)}\n\nRESPUESTA DE LA IA:\n${clip(aiAnswer, 2500)}` }];
}

// Lee el JSON del juez aunque venga con texto alrededor; si no se entiende, queda "parcial" para que una persona lo mire.
export function parseVerdict(text = '') {
  const match = String(text).match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const data = JSON.parse(match[0]);
      const verdict = String(data.veredicto || '').toLowerCase().trim();
      if (VERDICTS.includes(verdict)) return { verdict, reason: clip(data.motivo, 200) };
    } catch { /* sigue abajo */ }
  }
  const found = VERDICTS.find((verdict) => new RegExp(`"?${verdict}"?`, 'i').test(String(text)));
  return { verdict: found || 'parcial', reason: found ? clip(text, 200) : 'El juez no devolvió un veredicto claro.' };
}

export const REPLY_PROMPT = [
  'Sos quien redacta, para una persona del equipo de Grupo Poliplast (Argentina), el BORRADOR de respuesta a un cliente por WhatsApp. La persona lo revisa, lo edita y lo envía ella: vos no enviás nada.',
  'Escribí en español rioplatense, cordial y directo, como una persona (no como un robot ni un folleto): 2 a 5 frases, hasta unas 80 palabras, sin firma, sin emojis de más y sin "Estimado".',
  'Respondé a lo que el cliente pregunta en su ÚLTIMO mensaje, teniendo en cuenta lo ya hablado. Si saludó y no pidió nada, saludá y preguntá en qué lo podés ayudar.',
  'Usá SOLO los datos del CONTEXTO. NUNCA inventes precios, stock, plazos de entrega, rendimiento, tiempos de secado, compatibilidades ni certificaciones. Si el cliente pregunta algo que no está en el contexto, no lo respondas: pedí el dato que falta (producto, medida, superficie, cantidad, zona) o decí que lo confirmás en breve.',
  'Si el contexto trae "Respuesta del equipo en Mercado Libre" (la que más repetimos) o "Respuestas validadas por Felipe", esas mandan sobre cualquier otra. Si trae PRECIOS DE LISTA VIGENTES y el cliente pregunta cuánto sale, podés dar el precio final (IVA incluido) del producto o la presentación que nombró, aclarando que es precio de lista; si hay varias presentaciones y no dijo cuál, preguntá cuál. Siempre que menciones un precio, agregá en "Para revisar:" que confirmen el precio por cantidad o forma de pago antes de enviarlo.',
  'Si el contexto trae PREGUNTAS QUE FALTAN, hacé una o dos de las más útiles dentro del mensaje, no todas.',
  'Reglas de la empresa: nunca ofrezcas ni recomiendes a un competidor; máquinas, sistemas de poliuretano y repuestos los atiende Juan; Resinplast e Imperpur, Ezequiel; tiendas online, Brenda. Si corresponde derivar, decí que "te paso con" esa persona.',
  'FORMATO: primero el mensaje listo para pegar en WhatsApp, sin comillas ni títulos. Si hay algo que la persona debe verificar o completar antes de enviarlo (un dato, un precio, una medida), agregá al final una línea aparte que empiece con "Para revisar:" y lo diga en una frase corta. Si no hay nada que revisar, no la pongas.',
].join('\n');

// Perfil CLIENTE (3/11, Felipe: "separar lo que es cliente de lo interno"): el mismo motor y el mismo conocimiento, pero habla directo con
// el cliente por WhatsApp. Todavía NO está conectado a WhatsApp: solo existe el modo para probarlo y medirlo (una persona aprueba).
// Guía de objeciones de Academia comercial, pasada a lenguaje de cliente: se explora primero, no se baja el precio ni se inventa nada.
export const OBJECTIONS_GUIDE = [
  'CUANDO EL CLIENTE PONE UNA OBJECIÓN (guía de la Academia comercial): no discutas ni cedas de entrada; primero hacé UNA pregunta corta para entender y después respondé con el enfoque. Nunca bajes el precio primero, nunca critiques a otro proveedor, nunca fabriques urgencia, nunca prometas rendimiento, plazo, stock ni condiciones de pago que no estén en el contexto.',
  ...OBJECTIONS.map((item) => `- "${item.label}": preguntá ${item.explore} Enfoque: ${item.response}`),
].join('\n');

export const CUSTOMER_PROMPT_BASE = [
  'Sos el asistente virtual del equipo de Grupo Poliplast (Argentina) y le escribís DIRECTAMENTE al cliente por WhatsApp. Nadie revisa antes: cada frase la lee el cliente.',
  'Escribí en español rioplatense, cálido y simple, mensajes cortos (2 a 4 frases, hasta 60 palabras), sin viñetas, sin negritas, sin títulos, sin "Fuente:", sin hablar de "contexto", "ficha" ni "el CRM". Un emoji como mucho.',
  'Respondé lo que preguntó en su ÚLTIMO mensaje con el dato concreto. Usá SOLO el CONTEXTO. Lo que más repetimos en Mercado Libre y lo validado por Felipe manda sobre lo demás.',
  'NUNCA inventes ni estimes precios, stock, plazos de entrega, costo de envío, certificaciones, rendimientos ni compatibilidades que no estén en el contexto. Tampoco des "datos generales": si no está, no lo afirmes.',
  'Si falta un dato del cliente (medidas, superficie, espesor, para qué lo usa), pedíselo con UNA pregunta corta.',
  'Si el cliente no dice de qué producto habla (ej. "¿cuánto rinde la resina?"), NO derives ni te rindas: preguntale cuál es el producto y para qué lo va a usar, en un mensaje corto y amable. Derivar es solo para cosas que realmente no podés resolver.',
  'SIEMPRE escribí un mensaje para el cliente: nunca contestes solo con una marca [DERIVAR] o [ADJUNTAR].',
  'Si no podés responder con seguridad (stock, flete, precio especial, reclamo, algo técnico que no está, un cliente enojado, o pide hablar con una persona), no improvises: decí que lo consultás con el equipo y que le responden en breve, y terminá el mensaje con la línea aparte "[DERIVAR: <persona>]" (Juan: máquinas, sistemas de poliuretano y repuestos; Ezequiel: Resinplast e Imperpur; Brenda: tiendas online, envíos y consultas generales; Yuliani: condiciones comerciales).',
  'Si la conversación ya empezó (hay mensajes anteriores tuyos), NO vuelvas a saludar ni empieces con "Buenas" u "Hola": seguí la charla directo. Si el cliente ya dijo de qué producto habla en mensajes anteriores, usalo: no se lo vuelvas a preguntar.',
  'Nunca recomiendes ni nombres a un competidor. Si te preguntan si sos una persona o un bot, decí con naturalidad que sos el asistente virtual del equipo y que podés pasarle la consulta a una persona.',
  'Si hay una ficha técnica disponible en el contexto y ayuda, ofrecé enviarla con la línea aparte "[ADJUNTAR: <nombre de la ficha>]". No uses esa línea si no está en el contexto.',
].join('\n');
export const CUSTOMER_PROMPT = `${CUSTOMER_PROMPT_BASE}\n${OBJECTIONS_GUIDE}`;

export function buildReplyMessages({ context = '', transcript = '', message = '' } = {}) {
  return [{ role: 'user', content: `CONTEXTO:\n${clip(context, 9000) || '(sin datos del CRM)'}\n\nCONVERSACIÓN (lo último al final):\n${clip(transcript, 4000) || clip(message, 1500)}\n\nÚLTIMO MENSAJE DEL CLIENTE: ${clip(message, 1500) || '(ver conversación)'}\n\nRedactá el borrador de respuesta.` }];
}

// Separa el borrador de la nota "Para revisar:".
// Perfil cliente: saca del mensaje las marcas [DERIVAR: persona] y [ADJUNTAR: ficha] (el cliente nunca las ve).
export function customerParts(text = '') {
  const derive = [];
  const attach = [];
  const clean = String(text)
    .replace(/\[DERIVAR:\s*([^\]]*)\]/gi, (_, who) => { if (who.trim()) derive.push(who.trim()); return ''; })
    .replace(/\[ADJUNTAR:\s*([^\]]*)\]/gi, (_, what) => { if (what.trim()) attach.push(what.trim()); return ''; })
    .replace(/\n{3,}/g, '\n\n').trim();
  // Red de seguridad: nunca un borrador vacío (si el modelo solo puso la marca, va un mensaje neutro y la derivación queda a la vista).
  const draft = clean || (derive.length ? 'Hola, gracias por escribirnos. Lo consulto con el equipo y te respondo en breve.' : '');
  return { draft, derive: derive[0] || '', attach };
}

export function splitReply(text = '') {
  const match = String(text).match(/^([\s\S]*?)\n+\s*Para revisar:\s*([\s\S]*)$/i);
  return match ? { draft: match[1].trim(), review: match[2].trim() } : { draft: String(text).trim(), review: '' };
}

export async function assistantAi(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const question = String(request.body?.question || '').trim().slice(0, 4000);
  if (!question) return { status: 400, body: { error: 'Falta la pregunta.' } };
  if (!environment.ANTHROPIC_API_KEY) return { status: 200, body: { ok: false, reason: 'sin-clave' } };
  if (!isAdminEmail(caller.email) && !['juez', 'redactar'].includes(request.body?.mode) && (await countUsage(String(caller.email).toLowerCase(), environment, http)) > DAILY_AI_LIMIT) return { status: 200, body: { ok: false, reason: 'tope', error: `Llegaste al tope diario de ${DAILY_AI_LIMIT} preguntas a la IA. Mañana se renueva; mientras tanto el buscador sigue funcionando.` } };
  const practice = request.body?.mode === 'practica';
  const reply = request.body?.mode === 'respuesta';
  const judge = request.body?.mode === 'juez';
  const customer = request.body?.mode === 'cliente';
  const draft = request.body?.mode === 'redactar';
  const payload = JSON.stringify(draft ? {
    // ASSISTANT_DRAFT_MODEL permite usar un modelo más fuerte solo para redactar respuestas validadas.
    model: environment.ASSISTANT_DRAFT_MODEL || environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    max_tokens: 700,
    system: DRAFT_PROMPT,
    messages: buildDraftMessages({ product: request.body?.product, topic: request.body?.topic, pairs: request.body?.pairs }),
  } : judge ? {
    // ASSISTANT_JUDGE_MODEL permite un juez más fuerte que el modelo que contesta; sin cargar, usa el mismo.
    model: environment.ASSISTANT_JUDGE_MODEL || environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    max_tokens: 600,
    system: JUDGE_PROMPT,
    messages: buildJudgeMessages({ question, realAnswer: request.body?.realAnswer, aiAnswer: request.body?.aiAnswer }),
  } : customer ? {
    model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    max_tokens: 1500,
    system: `${CUSTOMER_PROMPT}\nHOY es ${String(request.body?.today || new Date().toISOString().slice(0, 10)).slice(0, 10)}.`,
    messages: buildReplyMessages({ context: request.body?.context, transcript: request.body?.transcript, message: question }),
  } : reply ? {
    model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    max_tokens: 1500,
    system: `${REPLY_PROMPT}\nHOY es ${String(request.body?.today || new Date().toISOString().slice(0, 10)).slice(0, 10)}.${request.body?.userName ? ` Quien lo va a enviar es ${clip(request.body.userName, 60)}.` : ''}`,
    messages: buildReplyMessages({ context: request.body?.context, transcript: request.body?.transcript, message: question }),
  } : practice ? {
    model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    max_tokens: 900,
    system: `${PRACTICE_PROMPT}\nESCENARIO: ${clip(request.body?.context, 1500)}`,
    messages: buildPracticeMessages({ question, history: request.body?.history }),
  } : {
    model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    // 22/10: con 900 las respuestas se cortaban a la mitad ("Ojo con una cont…").
    max_tokens: 2500,
    system: `${SYSTEM_PROMPT}\nHOY es ${String(request.body?.today || new Date().toISOString().slice(0, 10)).slice(0, 10)}.${request.body?.userName ? ` Te habla ${clip(request.body.userName, 60)}.` : ''}`,
    tools: ASSISTANT_TOOLS,
    messages: buildMessages({ question, context: request.body?.context, history: request.body?.history }),
  });
  const requestHeaders = { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(environment.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': environment.ANTHROPIC_WORKSPACE_ID } : {}) };
  let response;
  let body = null;
  // 22/10: si Anthropic está saturado (429/500/529 "overloaded"), reintenta una vez antes de rendirse.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await http(API, {
        method: 'POST',
        // 22/10: una clave de usuario (sin workspace) necesita el id del workspace en ANTHROPIC_WORKSPACE_ID.
        headers: requestHeaders,
        body: payload,
        signal: AbortSignal.timeout(attempt ? 25000 : 30000),
      });
    } catch {
      if (attempt) return { status: 200, body: { ok: false, reason: 'tardo', error: 'La IA tardó demasiado. Probá de nuevo.' } };
      continue;
    }
    body = await response.json().catch(() => null);
    if (response.ok || ![429, 500, 502, 503, 529].includes(response.status) || attempt) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!response) return { status: 200, body: { ok: false, reason: 'tardo', error: 'La IA tardó demasiado. Probá de nuevo.' } };
  if (!response.ok) {
    const type = body?.error?.type || '';
    // detail: el mensaje de Anthropic (nunca trae la clave), para saber qué falló.
    const detail = String(body?.error?.message || '').slice(0, 300);
    console.error('assistant-ai', response.status, type, detail);
    if (/credit|billing/i.test(detail)) return { status: 200, body: { ok: false, reason: 'sin-credito', detail, error: 'La IA no tiene crédito cargado.' } };
    if (/workspace/i.test(detail)) return { status: 200, body: { ok: false, reason: 'clave', detail, error: 'La clave de Anthropic no está asociada a un workspace: creá una clave dentro del workspace (Console → API Keys) o cargá ANTHROPIC_WORKSPACE_ID en Vercel.' } };
    if (response.status === 401 || response.status === 403) return { status: 200, body: { ok: false, reason: 'clave', detail, error: 'Anthropic no acepta la clave cargada en Vercel.' } };
    const busy = [429, 500, 502, 503, 529].includes(response.status);
    return { status: 200, body: { ok: false, reason: type || `HTTP ${response.status}`, detail, error: busy ? 'La IA está saturada en este momento. Probá de nuevo en un minuto.' : 'La IA no pudo responder.' } };
  }
  // 3/11: a veces Anthropic contesta sin texto (content vacío): se anota el motivo y se reintenta una vez antes de rendirse.
  const hasContent = (data) => (data?.content || []).some((part) => (part?.type === 'text' && String(part.text || '').trim()) || part?.type === 'tool_use');
  if (!hasContent(body)) {
    console.error('assistant-ai vacia', body?.stop_reason, (body?.content || []).map((part) => part?.type).join(','));
    try {
      const again = await http(API, { method: 'POST', headers: requestHeaders, body: payload, signal: AbortSignal.timeout(25000) });
      const retry = await again.json().catch(() => null);
      if (again.ok && hasContent(retry)) body = retry;
    } catch { /* sigue con la respuesta vacía */ }
  }
  const actions = actionsFrom(body?.content);
  const text = (body?.content || []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n').trim() || (actions.length ? 'Te propongo esto (confirmá abajo):' : '');
  if (!text) return { status: 200, body: { ok: false, reason: 'vacia', error: 'La IA no devolvió respuesta.' } };
  if (draft) return { status: 200, body: { ok: true, ...parseDraft(text), usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
  if (judge) return { status: 200, body: { ok: true, ...parseVerdict(text), usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
  if (customer) return { status: 200, body: { ok: true, review: '', ...customerParts(text), usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
  if (reply) return { status: 200, body: { ok: true, ...splitReply(text), usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
  const cut = body?.stop_reason === 'max_tokens';
  // 22/10: queda registrado que respondió (sin la pregunta ni la respuesta), para comprobarlo en Vercel.
  console.log('assistant-ai ok', body?.usage?.input_tokens ?? '?', body?.usage?.output_tokens ?? '?');
  return { status: 200, body: { ok: true, actions, text: cut ? `${text}…\n\n(Se cortó por largo: escribí "seguí" para el resto.)` : text, usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
}
