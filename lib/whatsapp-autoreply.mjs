// Respuesta automática de WhatsApp (3/11, Felipe: "que responda automáticamente a mi contacto"). PRUEBA ACOTADA: solo contesta a los
// contactos de la lista habilitada (hoy el de Felipe), solo si el interruptor está prendido, solo a mensajes de texto que el cliente
// mandó primero (dentro de la ventana de 24 h de Meta). Usa el perfil «cliente» del asistente: mensajes cortos, sin inventar precios,
// stock ni plazos, y deriva a una persona cuando no está seguro. Todo queda registrado (últimos 40) para poder verlo en Datos → Conexiones.
// Configuración y registro: crm_system_status, key «whatsapp-autoreply» (detail = { enabled, contacts, log }). Sin migración.
import { createClient } from '@supabase/supabase-js';
import { db } from './mercadolibre.mjs';
import { CUSTOMER_PROMPT, ASSISTANT_MODEL, buildReplyMessages, customerParts } from './assistant-ai.mjs';
import { loadReplyKnowledge } from '../src/reply-knowledge.mjs';
import { isIgnoredWhatsAppContact } from '../src/whatsapp-threads.mjs';

export const CONFIG_KEY = 'whatsapp-autoreply';
const GRAPH = 'https://graph.facebook.com/v21.0';
const LOG_LIMIT = 40;
const MAX_PER_HOUR = 12; // tope de seguridad por contacto
const MAX_PER_DAY = 150; // tope de seguridad total por día (cuida el crédito de la IA y evita descontrol)

const digits = (value) => String(value || '').replace(/\D/g, '');
// Argentina: 54 9 11 ... y 54 11 ... son el mismo número; se compara por los últimos 10 dígitos.
export const sameContact = (a, b) => { const x = digits(a).slice(-10); const y = digits(b).slice(-10); return x.length >= 8 && x === y; };

export async function readConfig(environment, http = fetch) {
  try {
    const rows = await db(environment, http).select(`crm_system_status?select=detail&key=eq.${CONFIG_KEY}`);
    const detail = rows?.[0]?.detail || {};
    return { enabled: detail.enabled === true, mode: detail.mode === 'todos' ? 'todos' : 'lista', contacts: Array.isArray(detail.contacts) ? detail.contacts : [], log: Array.isArray(detail.log) ? detail.log : [] };
  } catch { return { enabled: false, mode: 'lista', contacts: [], log: [] }; }
}

export async function writeConfig(environment, config, http = fetch) {
  await db(environment, http).upsert('crm_system_status', [{ key: CONFIG_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { enabled: config.enabled === true, mode: config.mode === 'todos' ? 'todos' : 'lista', contacts: config.contacts || [], log: (config.log || []).slice(-LOG_LIMIT) } }]);
}

// ¿Corresponde contestar este evento? (puro, para probarlo)
export function shouldReply(config, event, now = Date.now(), ignoredRules = []) {
  if (!config?.enabled) return { ok: false, reason: 'apagado' };
  if (event?.direction !== 'inbound' || event?.message_type !== 'text' || !String(event?.text_body || '').trim()) return { ok: false, reason: 'no-es-texto' };
  if (config.mode === 'todos') {
    // 3/11 (Felipe): a todos los contactos de Por revisar, salvo los marcados «no comerciales» (familiares, personales, otros).
    if (isIgnoredWhatsAppContact(ignoredRules, event)) return { ok: false, reason: 'no-comercial' };
  } else if (!(config.contacts || []).some((contact) => sameContact(contact.wa, event.customer_wa_id))) return { ok: false, reason: 'contacto-no-habilitado' };
  const today = new Date(now).toISOString().slice(0, 10);
  if ((config.log || []).filter((entry) => entry.status === 'enviado' && String(entry.at).slice(0, 10) === today).length >= MAX_PER_DAY) return { ok: false, reason: 'tope-por-dia' };
  if ((config.log || []).some((entry) => entry.event_id === event.event_id)) return { ok: false, reason: 'ya-contestado' };
  const lastHour = (config.log || []).filter((entry) => entry.status === 'enviado' && sameContact(entry.wa, event.customer_wa_id) && now - Date.parse(entry.at) < 3600000).length;
  if (lastHour >= MAX_PER_HOUR) return { ok: false, reason: 'tope-por-hora' };
  return { ok: true };
}

// Demora de una persona que lee y escribe: 3 a 9 segundos según el largo (no minutos: la función de Vercel tiene tope).
export const typingDelayMs = (text) => Math.min(9000, Math.max(3000, 1500 + String(text || '').length * 30));

async function graph(path, body, environment, http) {
  const response = await http(`${GRAPH}/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${environment.META_SYSTEM_USER_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data, error: response.ok ? '' : String(data?.error?.message || `HTTP ${response.status}`).slice(0, 240) };
}

export const sendText = ({ phoneNumberId, to, body }, environment, http = fetch) =>
  graph(`${phoneNumberId}/messages`, { messaging_product: 'whatsapp', to: digits(to), type: 'text', text: { body: String(body).slice(0, 1500) } }, environment, http);

// Marca el mensaje como leído y muestra «escribiendo…» (mejor esfuerzo: si falla, se sigue).
export const showTyping = ({ phoneNumberId, messageId }, environment, http = fetch) =>
  graph(`${phoneNumberId}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }, environment, http).catch(() => null);

// Contactos marcados «no comercial» por cualquier persona del equipo (se lee de sus espacios de trabajo; el servidor es el que decide).
export async function ignoredContacts(environment, http = fetch) {
  const rows = await db(environment, http).select('workspace_states?select=ignored:data->ignoredWhatsAppContacts');
  return (rows || []).flatMap((row) => (Array.isArray(row?.ignored) ? row.ignored : []));
}

async function transcriptOf(environment, http, event, config) {
  try {
    const rows = await db(environment, http).select(`whatsapp_events?select=text_body,created_at&customer_wa_id=eq.${encodeURIComponent(event.customer_wa_id)}&direction=eq.inbound&message_type=eq.text&order=created_at.desc&limit=6`);
    const mine = (config.log || []).filter((entry) => sameContact(entry.wa, event.customer_wa_id) && entry.status === 'enviado').slice(-3).map((entry) => ({ at: Date.parse(entry.at), line: `Nosotros: ${entry.reply}` }));
    const theirs = (rows || []).map((row) => ({ at: Date.parse(row.created_at), line: `Cliente: ${row.text_body}` }));
    return [...theirs, ...mine].sort((a, b) => a.at - b.at).map((item) => item.line).join('\n');
  } catch { return `Cliente: ${event.text_body}`; }
}

export async function generateReply({ question, transcript, context }, environment, http = fetch) {
  const request = () => http('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': environment.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(environment.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': environment.ANTHROPIC_WORKSPACE_ID } : {}) },
    body: JSON.stringify({ model: environment.ASSISTANT_MODEL || ASSISTANT_MODEL, max_tokens: 600, system: `${CUSTOMER_PROMPT}\nHOY es ${new Date().toISOString().slice(0, 10)}.`, messages: buildReplyMessages({ context, transcript, message: question }) }),
    signal: AbortSignal.timeout(14000),
  });
  let lastWhy = '';
  // Anthropic a veces contesta con el contenido vacío: se reintenta (hasta 3 veces) y, si sigue, el error dice por qué.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await request();
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(body?.error?.message || `IA: HTTP ${response.status}`).slice(0, 200));
    const text = (body?.content || []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n').trim();
    if (text) {
      const parts = customerParts(text);
      if (parts.draft) return parts;
    }
    lastWhy = `stop_reason=${body?.stop_reason || '?'}, partes=${(body?.content || []).map((part) => part?.type).join(',') || 'ninguna'}`;
    console.error('whatsapp-autoreply vacia', lastWhy);
  }
  throw new Error(`La IA no devolvió respuesta (${lastWhy}).`);
}

const logEntry = (event, extra) => ({ at: new Date().toISOString(), event_id: event.event_id, wa: digits(event.customer_wa_id), question: String(event.text_body || '').slice(0, 160), ...extra });

// Contesta los mensajes de texto entrantes de contactos habilitados. Nunca lanza: un error queda en el registro.
export async function autoReplyEvents(events, environment = process.env, deps = {}) {
  const http = deps.http || fetch;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let config = await readConfig(environment, http);
  const results = [];
  let ignoredRules = [];
  if (config.enabled && config.mode === 'todos') {
    try { ignoredRules = deps.ignored || await ignoredContacts(environment, http); }
    catch { return results; } // sin poder leer las marcas «no comercial» NO se contesta a nadie
  }
  for (const event of events || []) {
    const check = shouldReply(config, event, Date.now(), ignoredRules);
    if (!check.ok) continue;
    try {
      if (!environment.META_SYSTEM_USER_TOKEN) throw new Error('Falta META_SYSTEM_USER_TOKEN en Vercel.');
      if (!environment.ANTHROPIC_API_KEY) throw new Error('Falta la clave de la IA.');
      const supabase = deps.supabase || createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const knowledge = await loadReplyKnowledge(supabase, event.text_body, { today: new Date().toISOString().slice(0, 10) }).catch(() => '');
      const transcript = await transcriptOf(environment, http, event, config);
      const reply = await (deps.generate || generateReply)({ question: event.text_body, transcript, context: ['Canal: WhatsApp general de Grupo Poliplast.', knowledge].filter(Boolean).join('\n') }, environment, http);
      if (!reply.draft) throw new Error('La IA no armó un mensaje.');
      await showTyping({ phoneNumberId: event.phone_number_id, messageId: event.event_id }, environment, http);
      await sleep(typingDelayMs(reply.draft));
      const sent = await sendText({ phoneNumberId: event.phone_number_id, to: event.customer_wa_id, body: reply.draft }, environment, http);
      const entry = logEntry(event, sent.ok ? { status: 'enviado', reply: reply.draft, derive: reply.derive, attach: reply.attach } : { status: 'error', error: sent.error, reply: reply.draft, derive: reply.derive });
      config = { ...config, log: [...config.log, entry].slice(-LOG_LIMIT) };
      results.push(entry);
    } catch (error) {
      const entry = logEntry(event, { status: 'error', error: String(error?.message || error).slice(0, 240) });
      config = { ...config, log: [...config.log, entry].slice(-LOG_LIMIT) };
      results.push(entry);
    }
  }
  if (results.length) await writeConfig(environment, config, http).catch(() => null);
  return results;
}

// Panel de Más → Datos → Conexiones (solo administrador).
export async function whatsappAutoAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdmin(caller.email)) return { status: 403, body: { error: 'Solo Felipe puede cambiar esto.' } };
  const op = request.body?.op || 'status';
  const config = await readConfig(environment, http);
  const view = (extra = {}) => ({ ok: true, enabled: config.enabled, mode: config.mode, contacts: config.contacts, log: config.log.slice(-15).reverse(), tokenLoaded: Boolean(environment.META_SYSTEM_USER_TOKEN), ...extra });
  if (op === 'status') return { status: 200, body: view() };
  if (op === 'save') {
    const contacts = (Array.isArray(request.body?.contacts) ? request.body.contacts : []).map((item) => ({ wa: digits(item?.wa), name: String(item?.name || '').slice(0, 60) })).filter((item) => item.wa.length >= 8).slice(0, 5);
    const next = { ...config, enabled: request.body?.enabled === true, mode: request.body?.mode === 'todos' ? 'todos' : 'lista', contacts };
    await writeConfig(environment, next, http);
    return { status: 200, body: { ok: true, enabled: next.enabled, mode: next.mode, contacts, log: next.log.slice(-15).reverse(), tokenLoaded: Boolean(environment.META_SYSTEM_USER_TOKEN) } };
  }
  if (op === 'test') {
    const target = config.contacts[0];
    const phoneNumberId = environment.WHATSAPP_GENERAL_PHONE_ID;
    if (!target) return { status: 400, body: { error: 'Primero agregá tu número y guardá.' } };
    if (!environment.META_SYSTEM_USER_TOKEN || !phoneNumberId) return { status: 400, body: { error: 'Falta META_SYSTEM_USER_TOKEN o WHATSAPP_GENERAL_PHONE_ID en Vercel.' } };
    const sent = await sendText({ phoneNumberId, to: target.wa, body: 'Prueba del CRM de Poliplast: si ves este mensaje, el envío por WhatsApp funciona.' }, environment, http);
    return { status: 200, body: view({ test: sent.ok ? 'enviado' : `no se pudo enviar: ${sent.error}` }) };
  }
  return { status: 400, body: { error: 'Operación desconocida.' } };
}
