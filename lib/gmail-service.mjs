// Gmail desde el CRM (31/10): cada persona conecta SU casilla una vez; el CRM envía los mails aprobados desde ahí y lee las respuestas.
// Los accesos se guardan en gmail_accounts (solo servidor). Todo envío pasa por canSendNow: pausa, No contactar, horario, límite diario, rebote y respuesta.
import { db } from './mercadolibre.mjs';
import { authenticatedCorporateUser, isCorporateEmail, serviceHeaders } from './corporate-auth.mjs';
import { GMAIL_REDIRECT_URI, DAILY_LIMIT_START, argentinaDay, authUrl, buildRawMessage, fetchSignatureHtml, canSendNow, emailFromIdToken, exchangeCode, fetchThread, gmailEnabled, refreshAccessToken, repliesInThread, sendMessage, signState, verifyState } from './gmail.mjs';

const page = (title, text) => `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1>${title}</h1><p>${text}</p><p><a href="https://poli-crm.vercel.app/">Volver al CRM</a></p></body></html>`;
const dayStartIso = (now = new Date()) => new Date(`${argentinaDay(now)}T03:00:00.000Z`).toISOString(); // 00:00 argentinas

// Lista de No contactar del propio usuario, leída del servidor (no se confía en lo que manda el navegador).
async function blockedOf(user, environment, http) {
  const response = await http(`${environment.SUPABASE_URL}/rest/v1/workspace_states?select=data&workspace_key=eq.${encodeURIComponent(user.id)}`, { headers: serviceHeaders(environment) });
  if (!response.ok) throw new Error('No se pudo leer la lista de No contactar; no se envía nada.');
  const rows = await response.json();
  return Array.isArray(rows?.[0]?.data?.doNotContact) ? rows[0].data.doNotContact : [];
}

async function accessFor(account, environment, http) {
  return refreshAccessToken({ refreshToken: account.refresh_token, clientId: environment.GOOGLE_CLIENT_ID, clientSecret: environment.GOOGLE_CLIENT_SECRET }, http);
}

// Vuelta de Google (GET /api/gmail-callback → reescrito a /api/admin-users?gmail=callback).
export async function gmailCallback(request, response, environment = process.env, http = fetch) {
  const send = (status, title, text) => response.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(page(title, text));
  if (!gmailEnabled(environment)) return send(503, 'Gmail no está configurado', 'Faltan las credenciales de Google en Vercel.');
  const { code, state, error } = request.query || {};
  if (error) return send(400, 'No se conectó Gmail', 'Cancelaste el permiso o Google lo rechazó. Podés intentarlo de nuevo desde Prospección → Bandeja de salida.');
  const email = verifyState(state, environment.SUPABASE_SERVICE_ROLE_KEY);
  if (!email || !code) return send(400, 'El link venció', 'Volvé al CRM y tocá «Conectar mi Gmail» otra vez.');
  try {
    const token = await exchangeCode({ code: String(code), clientId: environment.GOOGLE_CLIENT_ID, clientSecret: environment.GOOGLE_CLIENT_SECRET, redirectUri: GMAIL_REDIRECT_URI }, http);
    const granted = emailFromIdToken(token.id_token);
    if (!granted || granted !== email) return send(403, 'Cuenta distinta', `Pediste conectar ${email} pero elegiste ${granted || 'otra cuenta'}. Volvé a intentarlo con tu cuenta de grupopoliplast.com.ar.`);
    if (!isCorporateEmail(granted)) return send(403, 'Cuenta no permitida', 'Solo se pueden conectar cuentas @grupopoliplast.com.ar.');
    if (!token.refresh_token) return send(400, 'Google no entregó el acceso permanente', 'Entrá a myaccount.google.com/permissions, quitá «Poliplast CRM» y probá de nuevo.');
    await db(environment, http).upsert('gmail_accounts', [{ email: granted, refresh_token: token.refresh_token, connected_at: new Date().toISOString(), last_error: '' }]);
    return send(200, 'Gmail conectado', `Ya podés enviar mails desde ${granted} con el CRM. Podés cerrar esta pestaña.`);
  } catch (caught) {
    console.error('gmail-callback', String(caught?.message || caught).slice(0, 200));
    return send(502, 'No se pudo conectar Gmail', String(caught?.message || 'Error desconocido').slice(0, 200));
  }
}

export async function gmailAdmin(request, environment = process.env, http = fetch, now = new Date()) {
  const caller = await authenticatedCorporateUser(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!gmailEnabled(environment)) return { status: 200, body: { ok: true, enabled: false, connected: false } };
  const store = db(environment, http);
  const email = String(caller.email).toLowerCase();
  const op = request.body?.op;
  const [account] = await store.select(`gmail_accounts?select=email,refresh_token,paused,last_error,connected_at&email=eq.${encodeURIComponent(email)}`).catch(() => []);
  try {
    if (op === 'status') {
      const sentToday = account ? await store.count(`gmail_sends?select=id&from_email=eq.${encodeURIComponent(email)}&sent_at=gte.${dayStartIso(now)}`) : 0;
      const auto = (await readAuto(store))[email] || {};
      return { status: 200, body: { ok: true, enabled: true, connected: Boolean(account), email, paused: Boolean(account?.paused), lastError: account?.last_error || '', sentToday, limit: Number(auto.perDay) || DAILY_LIMIT_START, autoSend: Boolean(auto.enabled) } };
    }
    if (op === 'authUrl') {
      const url = authUrl({ clientId: environment.GOOGLE_CLIENT_ID, redirectUri: GMAIL_REDIRECT_URI, state: signState(email, environment.SUPABASE_SERVICE_ROLE_KEY, now.getTime()), loginHint: email });
      return { status: 200, body: { ok: true, url } };
    }
    if (op === 'disconnect') {
      await store.remove('gmail_accounts', `email=eq.${encodeURIComponent(email)}`);
      return { status: 200, body: { ok: true } };
    }
    if (!account) return { status: 400, body: { error: 'Primero conectá tu Gmail.', code: 'sin_conexion' } };
    if (op === 'pause') {
      await store.patch('gmail_accounts', `email=eq.${encodeURIComponent(email)}`, { paused: Boolean(request.body?.paused) });
      return { status: 200, body: { ok: true, paused: Boolean(request.body?.paused) } };
    }
    if (op === 'autosend') {
      const users = await readAuto(store);
      users[email] = { enabled: request.body?.enabled === true, perDay: Math.min(30, Math.max(5, Number(request.body?.perDay) || DAILY_LIMIT_START)), userId: caller.id, updatedAt: new Date().toISOString() };
      await writeAuto(store, users);
      return { status: 200, body: { ok: true, autoSend: users[email].enabled, limit: users[email].perDay } };
    }
    if (op === 'sent-ids') {
      const since = new Date(now.getTime() - 45 * 86400000).toISOString();
      const rows = await store.select(`gmail_sends?select=item_id&from_email=eq.${encodeURIComponent(email)}&sent_at=gte.${since}&limit=1000`);
      return { status: 200, body: { ok: true, ids: rows.map((row) => row.item_id) } };
    }
    if (op === 'send') return await sendItem({ request, caller, email, account, store, environment, http, now });
    if (op === 'check-replies') return await checkReplies({ email, account, store, environment, http });
    return { status: 400, body: { error: 'Operación de Gmail desconocida.' } };
  } catch (caught) {
    const message = String(caught?.message || caught).slice(0, 240);
    console.error('gmail', op, message);
    if (/invalid_grant|renovar el acceso/.test(message)) {
      await store.patch('gmail_accounts', `email=eq.${encodeURIComponent(email)}`, { last_error: 'El acceso venció: hay que volver a conectar Gmail.' }).catch(() => {});
      return { status: 401, body: { error: 'El acceso a Gmail venció. Volvé a conectarlo.', code: 'sin_conexion' } };
    }
    return { status: 502, body: { error: message } };
  }
}

const AUTO_KEY = 'gmail-autosend';
const readAuto = async (store) => { try { const rows = await store.select(`crm_system_status?select=detail&key=eq.${AUTO_KEY}`); return rows?.[0]?.detail?.users || {}; } catch { return {}; } };
const writeAuto = (store, users) => store.upsert('crm_system_status', [{ key: AUTO_KEY, ok: true, last_run_at: new Date().toISOString(), detail: { users } }]);

async function sendItem({ request, caller, email, account, store, environment, http, now }) {
  const auto = (await readAuto(store))[email];
  return deliver({ item: request.body?.item || {}, caller, email, account, store, environment, http, now, limit: Number(auto?.perDay) || DAILY_LIMIT_START });
}

// Envía UN mail con todos los chequeos (los mismos para el botón y para el envío automático).
async function deliver({ item, caller, email, account, store, environment, http, now, limit = DAILY_LIMIT_START }) {
  const to = String(item.to || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !String(item.id || '') || !String(item.body || '').trim()) return { status: 400, body: { error: 'El mail no tiene destinatario, texto o identificador.' } };
  const sendsOf = (extra) => store.select(`gmail_sends?select=item_id,to_email,thread_id,subject,reply_kind&from_email=eq.${encodeURIComponent(email)}${extra}`);
  const [already] = await sendsOf(`&item_id=eq.${encodeURIComponent(item.id)}`);
  if (already) return { status: 409, body: { error: 'Este mail ya salió.', code: 'ya_enviado' } };
  const [blocked, sentToday, history] = await Promise.all([
    blockedOf(caller, environment, http),
    store.count(`gmail_sends?select=id&from_email=eq.${encodeURIComponent(email)}&sent_at=gte.${dayStartIso(now)}`),
    sendsOf(`&to_email=eq.${encodeURIComponent(to)}&order=sent_at.desc&limit=20`),
  ]);
  const verdict = canSendNow({
    item: { ...item, to, state: item.state === 'aprobado' ? 'aprobado' : item.state },
    sentToday, blocked, now, paused: account.paused, limit,
    repliedTo: history.filter((row) => row.reply_kind && row.reply_kind !== 'automatica').map((row) => row.to_email),
    bounced: history.filter((row) => row.reply_kind === 'rebote').map((row) => row.to_email),
    env: environment,
  });
  if (!verdict.ok) return { status: 200, body: { ok: false, sent: false, reason: verdict.reason } };
  // Los recordatorios van en el mismo hilo que el primer mail.
  const first = Number(item.step) > 1 ? history.find((row) => row.thread_id) : null;
  const accessToken = await accessFor(account, environment, http);
  // 3/11 (Felipe): sale con la firma de su Gmail (logo, cargo, mail). Si no se puede leer, sale sin ella y se avisa.
  let signatureHtml = '';
  let signatureError = '';
  try { signatureHtml = await fetchSignatureHtml(accessToken, email, http); } catch (error) { signatureError = String(error?.message || error).slice(0, 160); }
  const raw = buildRawMessage({ from: email, to, subject: first ? `Re: ${String(first.subject).replace(/^Re:\s*/i, '')}` : item.subject, body: item.body, signatureHtml });
  const sent = await sendMessage({ accessToken, raw, threadId: first?.thread_id || '' }, http);
  await store.upsert('gmail_sends', [{ from_email: email, item_id: String(item.id), to_email: to, company: String(item.company || '').slice(0, 160), step: Number(item.step) || 1, subject: String(item.subject || '').slice(0, 300), gmail_id: sent.id || '', thread_id: sent.threadId || '' }]);
  return { status: 200, body: { ok: true, sent: true, gmailId: sent.id, threadId: sent.threadId, sentToday: sentToday + 1, signature: Boolean(signatureHtml), signatureError } };
}

// Revisa los hilos de lo enviado en las últimas 3 semanas que todavía no tienen respuesta y guarda lo que encuentra.
async function checkReplies({ email, account, store, environment, http }) {
  const since = new Date(Date.now() - 21 * 86400000).toISOString();
  const open = await store.select(`gmail_sends?select=id,item_id,to_email,company,thread_id&from_email=eq.${encodeURIComponent(email)}&reply_kind=is.null&sent_at=gte.${since}&order=sent_at.desc&limit=60`);
  const accessToken = open.length ? await accessFor(account, environment, http) : '';
  const found = [];
  for (const row of open) {
    if (!row.thread_id) continue;
    let replies = [];
    try { replies = repliesInThread(await fetchThread({ accessToken, threadId: row.thread_id }, http), email); } catch { continue; }
    const reply = replies.find((item) => item.kind !== 'automatica') || null;
    if (!reply) continue;
    const emails = reply.emails || [];
    await store.patch('gmail_sends', `id=eq.${row.id}`, { reply_kind: reply.kind, reply_at: reply.at || new Date().toISOString(), reply_snippet: reply.snippet, reply_emails: emails });
    found.push({ itemId: row.item_id, to: row.to_email, company: row.company, kind: reply.kind, action: reply.action, snippet: reply.snippet, emails });
  }
  // Lo ya detectado y todavía sin atender también se devuelve, para que el panel lo muestre.
  return { status: 200, body: { ok: true, checked: open.length, replies: found } };
}

// Envío automático (3/11, Felipe: «20 a 30 por día»): varias veces por día manda los mails APROBADOS que ya tocan, hasta el tope diario de cada persona
// que lo activó. Lee la bandeja del espacio de trabajo y NO la modifica (la pantalla se entera por gmail_sends). Cada mail pasa por deliver: No contactar,
// horario lunes a viernes 9 a 18, pausa, rebote y respuesta. Sale de a pocos, con pausa entre uno y otro.
export async function gmailAutoSendCron(request, environment = process.env, http = fetch, now = new Date(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  if (!gmailEnabled(environment)) return { status: 200, body: { ok: true, skipped: 'Gmail apagado' } };
  const store = db(environment, http);
  const users = await readAuto(store);
  const today = argentinaDay(now);
  const deadline = Date.now() + 45000;
  const report = [];
  for (const [email, cfg] of Object.entries(users)) {
    if (!cfg?.enabled || !cfg.userId) continue;
    const [account] = await store.select(`gmail_accounts?select=email,refresh_token,paused&email=eq.${encodeURIComponent(email)}`).catch(() => []);
    if (!account || account.paused) { report.push({ email, skipped: account ? 'en pausa' : 'sin Gmail conectado' }); continue; }
    const rows = await store.select(`workspace_states?select=data&workspace_key=eq.${encodeURIComponent(cfg.userId)}`).catch(() => []);
    const outbox = Array.isArray(rows?.[0]?.data?.outbox) ? rows[0].data.outbox : [];
    const sentIds = new Set((await store.select(`gmail_sends?select=item_id&from_email=eq.${encodeURIComponent(email)}&limit=2000`).catch(() => [])).map((row) => row.item_id));
    const firstSent = (item) => outbox.some((other) => other.prospectId === item.prospectId && other.step === 1 && (other.state === 'enviado' || sentIds.has(String(other.id))));
    const due = outbox
      .filter((item) => item.state === 'aprobado' && String(item.dueOn) <= today && !sentIds.has(String(item.id)) && (Number(item.step) === 1 || firstSent(item)))
      .sort((a, b) => String(a.dueOn).localeCompare(String(b.dueOn)) || Number(a.step) - Number(b.step));
    let sent = 0;
    let stopped = '';
    for (const item of due.slice(0, 5)) {
      if (Date.now() > deadline) { stopped = 'se acabó el tiempo de esta pasada'; break; }
      const result = await deliver({ item, caller: { id: cfg.userId }, email, account, store, environment, http, now, limit: Number(cfg.perDay) || DAILY_LIMIT_START }).catch((error) => ({ status: 500, body: { ok: false, reason: String(error?.message || error).slice(0, 120) } }));
      if (result.body?.sent) { sent += 1; await sleep(6000); continue; }
      if (result.body?.code === 'ya_enviado') continue;
      stopped = result.body?.reason || result.body?.error || 'no salió';
      break;
    }
    report.push({ email, sent, pending: Math.max(0, due.length - sent), stopped });
  }
  return { status: 200, body: { ok: true, report } };
}
