// Lógica pura de la Bandeja del equipo: agrupa los mensajes entrantes por conversación,
// detecta lo pendiente, sugiere a quién asignar según reglas y arma una respuesta sugerida.
// El CRM nunca envía: la respuesta se copia y la manda la persona desde WhatsApp.
import { REPLY_TEMPLATES } from './knowledge.js';

const plain = (value = '') => String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function conversationKey(channel, waId) {
  return `${channel || 'general'}|${waId || ''}`;
}

// events: mensajes entrantes (más nuevos primero o no, da igual). statusEvents: confirmaciones
// de envío/lectura que Meta manda cuando alguien contesta desde el teléfono.
export function groupConversations(events = [], statusEvents = []) {
  const statusAt = new Map();
  for (const item of statusEvents) {
    const key = conversationKey(item.channel, item.customer_wa_id);
    const at = String(item.occurred_at || '');
    if (at > (statusAt.get(key) || '')) statusAt.set(key, at);
  }
  const map = new Map();
  for (const event of events) {
    if (event.direction && event.direction !== 'inbound') continue;
    const key = conversationKey(event.channel, event.customer_wa_id);
    const at = String(event.occurred_at || '');
    const current = map.get(key);
    if (!current) {
      map.set(key, { key, channel: event.channel || 'general', customerWaId: event.customer_wa_id || '', customerName: event.customer_name || '', lastText: event.text_body || '', lastAt: at, messages: 1 });
    } else {
      current.messages += 1;
      if (at > current.lastAt) { current.lastAt = at; current.lastText = event.text_body || current.lastText; }
      if (!current.customerName && event.customer_name) current.customerName = event.customer_name;
    }
  }
  return [...map.values()].map((conv) => ({ ...conv, answeredOutside: (statusAt.get(conv.key) || '') > conv.lastAt })).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// Reglas: primero las de palabra (más específicas), después las de canal. Gana la primera.
export function suggestOwner(conv, rules = [], members = []) {
  const active = new Set(members.filter((member) => member.active !== false).map((member) => member.id));
  const text = plain(conv.lastText);
  const hit = rules.find((rule) => rule.kind === 'palabra' && active.has(rule.member_id) && text.includes(plain(rule.value)))
    || rules.find((rule) => rule.kind === 'canal' && active.has(rule.member_id) && rule.value === conv.channel);
  return hit ? hit.member_id : null;
}

// Une conversaciones con lo guardado (asignación y estado compartidos) y con la sugerencia.
export function buildBoard(convs = [], assignments = [], rules = [], members = []) {
  const byKey = new Map(assignments.map((item) => [item.conversation_key, item]));
  return convs.map((conv) => {
    const saved = byKey.get(conv.key);
    const status = saved?.status || (conv.answeredOutside ? 'respondida' : 'pendiente');
    return {
      ...conv,
      memberId: saved?.member_id || null,
      status,
      note: saved?.note || '',
      suggestedId: saved?.member_id ? null : suggestOwner(conv, rules, members),
      open: status === 'pendiente' || status === 'derivada',
    };
  });
}

export function loadByMember(board = [], members = []) {
  const counts = new Map(members.map((member) => [member.id, 0]));
  let unassigned = 0;
  for (const item of board) {
    if (!item.open) continue;
    if (item.memberId && counts.has(item.memberId)) counts.set(item.memberId, counts.get(item.memberId) + 1);
    else unassigned += 1;
  }
  return { counts, unassigned };
}

export function waitingLabel(isoDate, now = Date.now()) {
  const ms = Math.max(0, now - new Date(isoDate).getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

const INTENTS = [
  [/precio|cotiz|presupuesto|cuanto sale|cuanto cuesta|costo|valor/, 'Preparar cotización', ['precio']],
  [/ficha|datasheet|especificacion/, 'Envío de ficha', ['ficha vigente']],
  [/stock|disponib|tienen|hay /, 'Diagnóstico', ['stock', 'plazo']],
  [/rendimiento|como se usa|como se aplica|aplicar|tecnic|sirve para/, 'Datos técnicos', ['dato técnico']],
  [/gracias|muchas gracias|ok|perfecto|dale/, 'Seguimiento', []],
];

export function suggestedReply(conv, sender = '') {
  const text = plain(conv.lastText);
  const [, title, validate] = INTENTS.find(([rx]) => rx.test(text)) || [null, 'Primera respuesta', []];
  const base = REPLY_TEMPLATES.general[title] || REPLY_TEMPLATES.general['Primera respuesta'];
  const first = String(conv.customerName || '').trim().split(/\s+/)[0] || '';
  const name = /^[\p{L}]{2,}$/u.test(first) ? first : '[nombre]';
  const who = String(sender || '').trim();
  const replaced = base.replaceAll('[nombre]', name);
  return { title, text: who ? `${replaced}\n\n${who}, Grupo Poliplast` : replaced, validate };
}
