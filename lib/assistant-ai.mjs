// Asistente con IA (21/10, preparado mientras se aprueban los créditos). Conversa con el equipo usando SOLO
// lo que el CRM encontró (guías, fichas, respuestas de Mercado Libre…), que arma el navegador con el mismo
// buscador del asistente. Regla de Felipe: la respuesta que más repetimos en Mercado Libre es la válida.
// La clave vive en Vercel (ANTHROPIC_API_KEY) y nunca sale del servidor. Sin clave, contesta
// { ok: false, reason: 'sin-clave' } y la ventana sigue funcionando como buscador, sin costo.
// Sin tope de preguntas por persona (pedido de Felipe): el límite es el crédito prepago de la cuenta.
import { authenticatedCorporateUser } from './corporate-auth.mjs';

const API = 'https://api.anthropic.com/v1/messages';
export const ASSISTANT_MODEL = 'claude-haiku-5-5';
const MAX_CONTEXT = 14000; // caracteres de contexto por pregunta
const MAX_TURNS = 8; // mensajes anteriores de la charla que se mandan
const MAX_TEXT = 2000;

export const SYSTEM_PROMPT = [
  'Sos el asistente interno de Grupo Poliplast (Argentina): espumas y sistemas de poliuretano, poliurea, resinas epoxi y poliéster (Resinplast), impermeabilizantes (Imperpur), máquinas proyectoras PURMAC y repuestos.',
  'Le respondés a alguien del equipo de ventas, en español rioplatense, corto y concreto: primero la respuesta, después el detalle si hace falta.',
  'Primero usá los datos del CONTEXTO que te pasa el CRM (son de Poliplast y mandan). Regla de la empresa: cuando el contexto trae "Respuesta del equipo en Mercado Libre" (la que más repetimos), esa es la respuesta válida aunque la ficha diga otra cosa; podés mencionar la diferencia.',
  'Si el contexto no alcanza, igual ayudá con tu conocimiento general (técnica de poliuretano, poliurea, epoxi, poliéster, impermeabilización, aplicación, seguridad, ventas, atención al cliente, Mercado Libre, uso de herramientas): marcalo con "Dato general (no es de Poliplast, conviene verificar)". Si es un dato de Poliplast que no está en el contexto, decilo y sugerí a quién consultar: máquinas, sistemas de poliuretano y repuestos → Juan; Resinplast e Imperpur → Ezequiel; tiendas online y consultas generales → Brenda.',
  'Nunca inventes precios, stock, plazos de entrega, clientes ni datos técnicos de NUESTROS productos (rendimiento, tiempos, dosificación, certificaciones) que no estén en el contexto. Los precios del CRM son siempre + IVA.',
  'También ayudás a usar el CRM: si preguntan para qué sirve una pantalla o cómo hacer algo, respondé con la parte "Cómo usar el CRM" del contexto y decí dónde está en el menú.',
  'Si preguntan por un cliente (contacto, teléfono, mail, cuándo compró, qué se habló), usá Clientes, Contabilium, Ventas cargadas e Historial del contexto. Las tareas, ventas, historial y prospectos del contexto son de la persona que pregunta.',
  'Si te piden un texto para un cliente, escribilo listo para copiar por WhatsApp, cordial y sin firmar.',
  'Respondé completo pero sin relleno (hasta unas 200 palabras, salvo que pidan más). Podés usar **negrita** y viñetas con "- ".',
  'Sos un asistente que AYUDA A HACER, no solo responde: si la persona pide agendar, recordar, anotar o escribir un mensaje, usá las herramientas crear_tarea, anotar_en_cliente o redactar_mensaje (la persona confirma antes de que se guarde). Si conviene un próximo paso (llamar, cotizar, seguimiento), proponelo. Para planificar el día usá las tareas del contexto.',
  'Si la persona pide un resumen de un cliente, armalo completo: quién es y cómo contactarlo, qué compra y cuándo compró (Contabilium y Ventas), lo último que se habló, tareas abiertas y qué conviene hacer ahora.',
  'Si el contexto trae REGLAS DE LA EMPRESA, cumplilas siempre por encima de todo. Nunca le ofrezcas nada a un competidor ni lo recomiendes. Para recomendar un aplicador, usá solo la lista de la red RAPYP del contexto (la primera es el mejor cliente); si no está, decí que lo consulten con Juan o David.',
  'Nunca digas que no podés guardar o recordar algo: si la persona pide guardar una respuesta, proponela con guardar_respuesta (queda en el CRM para todos). Lo que se habló antes en esta charla sigue valiendo: no lo desmientas porque no aparezca otra vez en el contexto.',
  'Si el contexto trae "Lo que anotó el equipo", es la experiencia real de los comerciales con clientes: usala para responder (qué funcionó, qué objeciones hubo) y nombrá de qué cliente sale. Si falta el dato o hace falta una persona, decí a quién derivarlo según "A QUIÉN DERIVAR" y ofrecé crear la tarea para esa persona.',
  'Terminá con una línea "Fuente:" diciendo de dónde salió el dato (guía, ficha, Mercado Libre, CRM o conocimiento general).',
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

export async function assistantAi(request, environment = process.env, http = fetch) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const question = String(request.body?.question || '').trim();
  if (!question) return { status: 400, body: { error: 'Falta la pregunta.' } };
  if (!environment.ANTHROPIC_API_KEY) return { status: 200, body: { ok: false, reason: 'sin-clave' } };
  const payload = JSON.stringify({
    model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
    // 22/10: con 900 las respuestas se cortaban a la mitad ("Ojo con una cont…").
    max_tokens: 2500,
    system: `${SYSTEM_PROMPT}\nHOY es ${String(request.body?.today || new Date().toISOString().slice(0, 10)).slice(0, 10)}.${request.body?.userName ? ` Te habla ${clip(request.body.userName, 60)}.` : ''}`,
    tools: ASSISTANT_TOOLS,
    messages: buildMessages({ question, context: request.body?.context, history: request.body?.history }),
  });
  let response;
  let body = null;
  // 22/10: si Anthropic está saturado (429/500/529 "overloaded"), reintenta una vez antes de rendirse.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await http(API, {
        method: 'POST',
        // 22/10: una clave de usuario (sin workspace) necesita el id del workspace en ANTHROPIC_WORKSPACE_ID.
        headers: { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(environment.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': environment.ANTHROPIC_WORKSPACE_ID } : {}) },
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
  const actions = actionsFrom(body?.content);
  const text = (body?.content || []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n').trim() || (actions.length ? 'Te propongo esto (confirmá abajo):' : '');
  if (!text) return { status: 200, body: { ok: false, reason: 'vacia', error: 'La IA no devolvió respuesta.' } };
  const cut = body?.stop_reason === 'max_tokens';
  // 22/10: queda registrado que respondió (sin la pregunta ni la respuesta), para comprobarlo en Vercel.
  console.log('assistant-ai ok', body?.usage?.input_tokens ?? '?', body?.usage?.output_tokens ?? '?');
  return { status: 200, body: { ok: true, actions, text: cut ? `${text}…\n\n(Se cortó por largo: escribí "seguí" para el resto.)` : text, usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
}
