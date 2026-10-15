// Chequeo diario de que Meta sigue entregando mensajes al CRM. Corre dentro del
// cron de mantenimiento (no suma funciones al plan) y deja el resultado en
// crm_system_status (key 'whatsapp-health'); el Inicio lo muestra como aviso.
// Nunca manda mensajes ni mails: solo lee de Meta y de la base.
import { diagnoseMeta, webhookStatus } from './meta-diagnose.mjs';

export const WHATSAPP_HEALTH_KEY = 'whatsapp-health';
// Solo la cuenta General: el acceso técnico no puede leer las otras (pertenecen a otro negocio de Meta) y daría falsa alarma todos los días.
export const MONITORED_WABAS = { general: '1620643669067135' };
export const WEBHOOK_URL = 'https://poli-crm.vercel.app/api/whatsapp-webhook';
export const WABA_APP_ID = '857121580457426';
export const SILENCE_HOURS = 72;

// Puro y testeado: del resultado de diagnoseMeta + webhookStatus + la hora del
// último mensaje entrante devuelve la lista de problemas en palabras claras.
export function evaluateWhatsAppHealth({ report, webhook, lastInboundAt, now = new Date(), expectedUrl = WEBHOOK_URL, appName = null }) {
  const problems = [];
  if (!report || report.token?.error) problems.push('No se pudo consultar a Meta con el acceso técnico (¿token vencido o removido?).');
  else if (report.token?.isValid === false) problems.push('El acceso técnico a Meta ya no es válido.');
  for (const account of report?.accounts || []) {
    const label = account.channel;
    if (account.subscribedApps?.error) problems.push(`${label}: no se pudo leer la suscripción de la cuenta (${account.subscribedApps.error}).`);
    else if (Array.isArray(account.subscribedApps) && account.subscribedApps.length === 0) problems.push(`${label}: la cuenta de WhatsApp no tiene ninguna app suscripta, Meta no entrega mensajes.`);
    else if (appName && Array.isArray(account.subscribedApps) && !account.subscribedApps.includes(appName)) problems.push(`${label}: la cuenta no está suscripta a la app del CRM.`);
    if (Array.isArray(account.wabaWebhookOverride) && account.wabaWebhookOverride.length) problems.push(`${label}: la cuenta tiene una dirección de webhook propia que pisa a la del CRM.`);
    const numbers = Array.isArray(account.phoneNumbers) ? account.phoneNumbers : [];
    if (!Array.isArray(account.phoneNumbers)) problems.push(`${label}: no se pudieron leer los números (${account.phoneNumbers?.error || 'sin dato'}).`);
    for (const number of numbers) {
      if (number.status && number.status !== 'CONNECTED') problems.push(`${label}: el número ${number.number} figura "${number.status}" en Meta.`);
      if (number.webhookOverride) problems.push(`${label}: el número ${number.number} tiene un webhook propio que pisa al del CRM.`);
    }
  }
  if (webhook?.error) problems.push(`No se pudo leer el webhook de la app: ${webhook.error}`);
  else if (webhook && webhook.subscribed === false) problems.push('La app de Meta no tiene webhook de WhatsApp configurado.');
  else if (webhook) {
    if (webhook.active === false) problems.push('El webhook de la app está inactivo en Meta.');
    if (webhook.urlOk === false) problems.push('El webhook de la app apunta a otra dirección distinta a la del CRM.');
    if (webhook.messagesField === false) problems.push('El webhook de la app no incluye el campo "messages".');
  }
  const hoursSilent = lastInboundAt ? (now - new Date(lastInboundAt)) / 3_600_000 : null;
  if (hoursSilent !== null && hoursSilent > SILENCE_HOURS) problems.push(`Hace ${Math.floor(hoursSilent / 24)} días que no entra ningún mensaje de clientes por General (si fue un fin de semana largo, ignoralo).`);
  return { ok: problems.length === 0, problems, lastInboundAt: lastInboundAt || null, checkedAt: now.toISOString() };
}

async function lastInboundAt(environment, http) {
  try {
    const response = await http(`${environment.SUPABASE_URL}/rest/v1/whatsapp_events?select=occurred_at&channel=eq.general&direction=eq.inbound&order=occurred_at.desc&limit=1`, {
      headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return rows[0]?.occurred_at || null;
  } catch { return null; }
}

// Consulta a Meta y a la base, evalúa y guarda el resultado. Si falta configuración, no hace nada.
export async function runWhatsAppHealthCheck(environment = process.env, { http = fetch, now = new Date() } = {}) {
  if (!environment.META_SYSTEM_USER_TOKEN || !environment.SUPABASE_URL) return { skipped: true };
  const report = await diagnoseMeta({ token: environment.META_SYSTEM_USER_TOKEN, wabas: MONITORED_WABAS, http });
  const webhook = await webhookStatus({ appId: report.token?.appId || environment.META_APP_ID || WABA_APP_ID, appSecret: environment.META_APP_SECRET, expectedUrl: WEBHOOK_URL, http });
  const verdict = evaluateWhatsAppHealth({ report, webhook, lastInboundAt: await lastInboundAt(environment, http), now });
  const nowISO = now.toISOString();
  const saved = await http(`${environment.SUPABASE_URL}/rest/v1/crm_system_status?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: WHATSAPP_HEALTH_KEY, last_run_at: nowISO, ok: verdict.ok, detail: { problems: verdict.problems, lastInboundAt: verdict.lastInboundAt }, updated_at: nowISO }),
  }).catch(() => null);
  return { ...verdict, saved: Boolean(saved?.ok) };
}
