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
  if ((request.body?.op || 'status') === 'set') {
    const paused = request.body?.paused === true;
    const at = new Date().toISOString();
    await db(environment, http).upsert('crm_system_status', [{ key: PAUSE_KEY, ok: !paused, last_run_at: at, detail: { paused, by: caller.email, at } }]);
    return { status: 200, body: { ok: true, paused, by: caller.email, at } };
  }
  return { status: 200, body: { ok: true, ...(await readPause(environment, http)) } };
}
