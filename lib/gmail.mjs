// Etapa 3 del plan estilo Harvey (30/10): enviar y leer mails desde la cuenta de cada persona con la Gmail API.
// APAGADO hasta que el administrador de Workspace cargue GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel (ver docs/PEDIDO_GOOGLE_CLOUD_2026-10-30.md).
// Acá solo hay lógica pura y pedidos a Google; los tokens se guardan en el servidor, nunca en el navegador. Puro y testeado con respuestas simuladas.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { blockedBy } from '../src/do-not-contact.mjs';

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'];
export const DAILY_LIMIT_START = 25; // por persona, sube de a poco
export const SEND_HOURS = { from: 9, to: 18 }; // horario de oficina argentino
export const FOLLOW_UP_DAYS = [3, 7];

export const gmailEnabled = (env = process.env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function authUrl({ clientId, redirectUri, state, loginHint = '', hostedDomain = 'grupopoliplast.com.ar' }) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: GMAIL_SCOPES.join(' '), state, hd: hostedDomain });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

const b64url = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = (value) => String(value).replace(/[\r\n]+/g, ' ').trim();
const encodedSubject = (subject) => (/^[\x20-\x7e]*$/.test(subject) ? header(subject) : `=?UTF-8?B?${Buffer.from(header(subject), 'utf8').toString('base64')}?=`);

// Mensaje RFC 2822 en texto plano, con cabecera de baja (List-Unsubscribe) y sin adjuntos ni enlaces propios.
export function buildRawMessage({ from, to, subject, body, inReplyTo = '', references = '' }) {
  const lines = [`From: ${header(from)}`, `To: ${header(to)}`, `Subject: ${encodedSubject(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', `List-Unsubscribe: <mailto:${header(from)}?subject=BAJA>`];
  if (inReplyTo) { lines.push(`In-Reply-To: ${header(inReplyTo)}`); lines.push(`References: ${header(references || inReplyTo)}`); }
  return b64url(`${lines.join('\r\n')}\r\n\r\n${String(body).replace(/\r?\n/g, '\r\n')}`);
}

// Hora argentina (UTC-3, sin horario de verano).
export const argentinaHour = (now = new Date()) => (now.getUTCHours() + 21) % 24;
export const argentinaDay = (now = new Date()) => new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

// ¿Puede salir este mail ahora? Frena por: Gmail apagado, lista de No contactar, fuera de horario, límite diario, o ya respondió/rebotó.
export function canSendNow({ item, sentToday = 0, limit = DAILY_LIMIT_START, blocked = [], now = new Date(), repliedTo = [], bounced = [], paused = false, env = process.env }) {
  if (!gmailEnabled(env)) return { ok: false, reason: 'Gmail todavía no está conectado (faltan las credenciales de Google)' };
  if (paused) return { ok: false, reason: 'Envíos en pausa' };
  if (item.state !== 'aprobado') return { ok: false, reason: 'El mail no está aprobado' };
  if (blockedBy({ email: item.to, company: item.company }, blocked)) return { ok: false, reason: 'Está en la lista de No contactar' };
  const to = String(item.to).toLowerCase();
  if (bounced.map((x) => String(x).toLowerCase()).includes(to)) return { ok: false, reason: 'El mail rebotó antes' };
  if (item.step > 1 && repliedTo.map((x) => String(x).toLowerCase()).includes(to)) return { ok: false, reason: 'Ya respondió: no se insiste' };
  const hour = argentinaHour(now);
  if (hour < SEND_HOURS.from || hour >= SEND_HOURS.to) return { ok: false, reason: 'Fuera del horario de envío (9 a 18 hs)' };
  const day = new Date(now.getTime() - 3 * 3600 * 1000).getUTCDay();
  if (day === 0 || day === 6) return { ok: false, reason: 'Fin de semana' };
  if (sentToday >= limit) return { ok: false, reason: `Llegó al límite de ${limit} mails por día` };
  return { ok: true, reason: '' };
}

// Recordatorios: pasos 2 y 3 que ya "tocan" (fecha vencida), con el paso 1 enviado y sin respuesta ni etiqueta de seguimiento.
export function followUpsDue(outbox = [], { today = argentinaDay(), repliedTo = [], tagged = [] } = {}) {
  const sent1 = new Set(outbox.filter((x) => x.step === 1 && x.state === 'enviado').map((x) => x.prospectId));
  const skip = new Set([...repliedTo, ...tagged].map((x) => String(x).toLowerCase()));
  return outbox.filter((x) => x.step > 1 && x.state === 'aprobado' && sent1.has(x.prospectId) && x.dueOn <= today && !skip.has(String(x.to).toLowerCase()));
}

// Lectura de una respuesta SIN IA como red de seguridad: baja, rebote, fuera de oficina o "otro contacto". La IA afina el resto.
export function classifyReply(text = '', { subject = '' } = {}) {
  const plain = `${subject} ${text}`.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(baja|desuscrib|no me escriban|no envi|dejen de|eliminen mi)/.test(plain)) return { kind: 'baja', action: 'Pasar a No contactar' };
  if (/(mail delivery|undeliverable|no se pudo entregar|delivery status|mailer-daemon|address not found)/.test(plain)) return { kind: 'rebote', action: 'Marcar el mail como inválido' };
  if (/(fuera de la oficina|out of office|respuesta automatica|vacaciones)/.test(plain)) return { kind: 'automatica', action: 'Esperar y reintentar' };
  const other = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
  if (/(compras|administracion|escribi|comunic|contact)/.test(plain) && other.length) return { kind: 'otro-contacto', action: 'Sumar el mail a la ficha y escribirle', emails: [...new Set(other)] };
  if (/(no nos interesa|no me interesa|no necesitamos|ya tenemos proveedor|no por ahora|gracias, no)/.test(plain)) return { kind: 'no-interesa', action: 'Marcar Sin interés' };
  if (/(me interesa|nos interesa|pasame|pasenme|precio|cotiz|lista de precios|catalogo|llamame|llamenme)/.test(plain)) return { kind: 'interesado', action: 'Crear tarea y responder' };
  return { kind: 'revisar', action: 'Que lo lea una persona' };
}

export async function exchangeCode({ code, clientId, clientSecret, redirectUri }, fetchFn = fetch) {
  const response = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const json = await response.json();
  if (!response.ok) throw new Error(`Google rechazó el código: ${json.error_description || json.error || response.status}`);
  return json;
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret }, fetchFn = fetch) {
  const response = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }) });
  const json = await response.json();
  if (!response.ok) throw new Error(`No se pudo renovar el acceso a Gmail: ${json.error_description || json.error || response.status}`);
  return json.access_token;
}

export async function sendMessage({ accessToken, raw, threadId = '' }, fetchFn = fetch) {
  const response = await fetchFn('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(threadId ? { raw, threadId } : { raw }) });
  const json = await response.json();
  if (!response.ok) throw new Error(`Gmail no envió el mail: ${json.error?.message || response.status}`);
  return { id: json.id, threadId: json.threadId };
}

// ---- Conexión (31/10): firma del "state" del OAuth, lectura del mail desde el id_token y respuestas de un hilo ----
export const GMAIL_REDIRECT_URI = 'https://poli-crm.vercel.app/api/gmail-callback';
const STATE_MAX_AGE_MS = 15 * 60 * 1000;
const stateSignature = (email, ts, secret) => createHmac('sha256', String(secret)).update(`${email}|${ts}`).digest('base64url');

// El state ata el permiso a quien lo pidió: así nadie conecta un buzón ajeno ni reusa el link.
export function signState(email, secret, now = Date.now()) {
  const clean = String(email).trim().toLowerCase();
  return `${Buffer.from(clean).toString('base64url')}.${now}.${stateSignature(clean, now, secret)}`;
}

export function verifyState(state, secret, now = Date.now()) {
  const [encoded, ts, sig] = String(state || '').split('.');
  if (!encoded || !ts || !sig) return null;
  const email = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = stateSignature(email, ts, secret);
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!(now - Number(ts) >= 0 && now - Number(ts) <= STATE_MAX_AGE_MS)) return null;
  return email;
}

// Google devuelve el id_token directamente en el canje del código (por HTTPS, sin pasar por el navegador).
export function emailFromIdToken(idToken = '') {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1] || '', 'base64url').toString('utf8'));
    return payload.email_verified === false ? '' : String(payload.email || '').toLowerCase();
  } catch { return ''; }
}

// Una respuesta es todo mensaje del hilo que no salió de la casilla de quien envió. Los rebotes llegan de mailer-daemon.
export function repliesInThread(thread = {}, ownEmail = '') {
  const own = String(ownEmail).toLowerCase();
  const out = [];
  for (const message of thread.messages || []) {
    const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [String(h.name).toLowerCase(), h.value || '']));
    const from = String(headers.from || '').toLowerCase();
    if (!from || from.includes(own)) continue;
    const bounce = /mailer-daemon|postmaster/.test(from);
    const text = String(message.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const result = bounce ? { kind: 'rebote', action: 'Marcar el mail como inválido' } : classifyReply(text, { subject: headers.subject || '' });
    out.push({ id: message.id, at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : '', from, snippet: text.slice(0, 240), ...result });
  }
  return out;
}

export async function fetchThread({ accessToken, threadId }, fetchFn = fetch) {
  const response = await fetchFn(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await response.json();
  if (!response.ok) throw new Error(`Gmail no devolvió el hilo: ${json.error?.message || response.status}`);
  return json;
}
