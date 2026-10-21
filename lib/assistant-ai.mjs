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
  'Usá SOLO los datos del CONTEXTO que te pasa el CRM. Regla de la empresa: cuando el contexto trae "Respuesta del equipo en Mercado Libre" (la que más repetimos), esa es la respuesta válida aunque la ficha diga otra cosa; podés mencionar la diferencia.',
  'Si el contexto no alcanza para responder, decilo claro y sugerí a quién consultar: máquinas, sistemas de poliuretano y repuestos → Juan; Resinplast e Imperpur → Ezequiel; tiendas online y consultas generales → Brenda.',
  'Nunca inventes precios, stock, plazos de entrega ni datos técnicos que no estén en el contexto. Los precios del CRM son siempre + IVA.',
  'También ayudás a usar el CRM: si preguntan para qué sirve una pantalla o cómo hacer algo, respondé con la parte "Cómo usar el CRM" del contexto y decí dónde está en el menú.',
  'Si preguntan por un cliente (contacto, teléfono, mail, cuándo compró, qué se habló), usá Clientes, Contabilium, Ventas cargadas e Historial del contexto. Las tareas, ventas, historial y prospectos del contexto son de la persona que pregunta.',
  'Si te piden un texto para un cliente, escribilo listo para copiar por WhatsApp, cordial y sin firmar.',
  'Terminá con una línea "Fuente:" diciendo de dónde salió el dato (guía, ficha o Mercado Libre).',
].join('\n');

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
  let response;
  try {
    response = await http(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: buildMessages({ question, context: request.body?.context, history: request.body?.history }),
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    return { status: 200, body: { ok: false, reason: 'tardo', error: 'La IA tardó demasiado. Probá de nuevo.' } };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const type = body?.error?.type || '';
    // Sin crédito o clave inválida: la ventana vuelve a funcionar como buscador.
    // detail: el mensaje de Anthropic (nunca trae la clave), para saber qué falló en la prueba de Felipe.
    const detail = String(body?.error?.message || '').slice(0, 300);
    if (/credit|billing/i.test(detail)) return { status: 200, body: { ok: false, reason: 'sin-credito', detail, error: 'La IA no tiene crédito cargado.' } };
    if (response.status === 401 || response.status === 403) return { status: 200, body: { ok: false, reason: 'clave', detail, error: 'Anthropic no acepta la clave cargada en Vercel.' } };
    return { status: 200, body: { ok: false, reason: type || `HTTP ${response.status}`, detail, error: 'La IA no pudo responder ahora. Probá de nuevo.' } };
  }
  const text = (body?.content || []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n').trim();
  if (!text) return { status: 200, body: { ok: false, reason: 'vacia', error: 'La IA no devolvió respuesta.' } };
  return { status: 200, body: { ok: true, text, usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null } } };
}
