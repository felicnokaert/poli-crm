// Pausa global de lo automático (4/11, idea 2 de la revisión): un interruptor que apaga a la vez la respuesta automática de WhatsApp y el
// envío automático de Gmail, con quién lo pulsó y cuándo. Se guarda en crm_system_status key `automations-pause`.
// Lo manual (botones de una persona) no se frena.
import { db } from './mercadolibre.mjs';

export const PAUSE_KEY = 'automations-pause';

export async function readPause(environment = process.env, http = fetch) {
  try {
    const rows = await db(environment, http).select(`crm_system_status?select=detail&key=eq.${PAUSE_KEY}`);
    const detail = rows?.[0]?.detail || {};
    return { paused: detail.paused === true, by: String(detail.by || ''), at: String(detail.at || '') };
  } catch { return { paused: false, by: '', at: '' }; }
}

export async function automationPauseAdmin(request, environment = process.env, http = fetch, { authenticate, isAdmin } = {}) {
  const caller = await authenticate(request, environment, http);
  if (!caller?.id) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (!isAdmin(caller.email)) return { status: 403, body: { error: 'Solo un administrador puede pausar lo automático.' } };
  // Lo que hizo el CRM solo (4/11): respuestas automáticas de WhatsApp y mails enviados, de los últimos días, para revisarlo en un solo lugar.
  if (request.body?.op === 'activity') {
    const store = db(environment, http);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [whatsapp, gmail] = await Promise.all([
      store.select(`whatsapp_events?select=event_id,customer_wa_id,customer_name,text_body,occurred_at,channel&direction=eq.outbound&raw_payload->>auto=eq.true&occurred_at=gte.${since}&order=occurred_at.desc&limit=30`).catch(() => []),
      store.select(`gmail_sends?select=from_email,to_email,company,step,sent_at,reply_kind&sent_at=gte.${since}&order=sent_at.desc&limit=40`).catch(() => []),
    ]);
    return { status: 200, body: { ok: true, whatsapp: whatsapp.map((row) => ({ at: row.occurred_at, channel: row.channel, name: row.customer_name || '', wa: String(row.customer_wa_id || '').slice(-4), text: String(row.text_body || '').slice(0, 400) })), gmail: gmail.map((row) => ({ at: row.sent_at, from: String(row.from_email || '').split('@')[0], to: row.to_email, company: row.company, step: row.step, reply: row.reply_kind || '' })) } };
  }
  if ((request.body?.op || 'status') === 'set') {
    const paused = request.body?.paused === true;
    const at = new Date().toISOString();
    await db(environment, http).upsert('crm_system_status', [{ key: PAUSE_KEY, ok: !paused, last_run_at: at, detail: { paused, by: caller.email, at } }]);
    return { status: 200, body: { ok: true, paused, by: caller.email, at } };
  }
  return { status: 200, body: { ok: true, ...(await readPause(environment, http)) } };
}
