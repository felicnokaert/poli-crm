// Registro persistente de las llamadas al webhook de WhatsApp (tabla
// whatsapp_webhook_log). Nunca guarda texto de mensajes ni teléfonos: solo la
// forma del aviso. Es "best effort": si falla, el webhook sigue funcionando.

export function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const types = {};
  const phoneNumberIds = new Set();
  const fields = new Set();
  // Avisos de la cuenta (account_update, calidad, bloqueos…): se guardan con su evento para saber POR QUÉ (4/11: la línea general figuró DISCONNECTED y no quedó el motivo).
  const accountEvents = [];
  const KEEP = ['event', 'phone_number', 'display_phone_number', 'current_limit', 'decision', 'disable_info', 'ban_info', 'restriction_info', 'violation_info', 'reason', 'requested_verified_name', 'rejection_reason', 'current_quality_score', 'new_quality_score'];
  for (const entry of entries) {
    for (const item of entry?.messaging || []) if (item?.message) types['dm'] = (types['dm'] || 0) + 1; // Instagram y Messenger
    for (const change of entry?.changes || []) {
      if (change?.field) fields.add(change.field);
      const value = change?.value || {};
      if (change?.field && change.field !== 'messages' && accountEvents.length < 5) {
        const kept = Object.fromEntries(KEEP.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
        accountEvents.push({ field: change.field, ...Object.fromEntries(Object.entries(kept).map(([key, item]) => { const text = typeof item === 'string' ? item : JSON.stringify(item); return [key, text.length > 200 ? `${text.slice(0, 200)}…` : item]; })) });
      }
      if (value.metadata?.phone_number_id) phoneNumberIds.add(String(value.metadata.phone_number_id));
      for (const message of value.messages || []) types[`msg:${message.type || '?'}`] = (types[`msg:${message.type || '?'}`] || 0) + 1;
      for (const status of value.statuses || []) types[`status:${status.status || '?'}`] = (types[`status:${status.status || '?'}`] || 0) + 1;
    }
  }
  return { object: payload.object || null, entries: entries.length, fields: [...fields], phoneNumberIds: [...phoneNumberIds], types, ...(accountEvents.length ? { accountEvents } : {}) };
}

function restHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

export async function logWebhookCall(row, environment = process.env, http = fetch) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await http(`${url}/rest/v1/whatsapp_webhook_log`, {
      method: 'POST',
      headers: restHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ method: row.method, outcome: row.outcome, status_code: row.statusCode ?? null, body_bytes: row.bodyBytes ?? null, has_signature: row.hasSignature ?? null, summary: row.summary ?? null }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function recentWebhookCalls(environment = process.env, http = fetch) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { available: false };
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const response = await http(`${url}/rest/v1/whatsapp_webhook_log?select=received_at,method,outcome,status_code,summary&received_at=gte.${encodeURIComponent(since)}&order=received_at.desc&limit=200`, { headers: restHeaders(key) });
    if (!response.ok) return { available: false, error: `HTTP ${response.status} (¿falta aplicar la migración?)` };
    const rows = await response.json();
    const posts = rows.filter((row) => row.method === 'POST');
    const byOutcome = {};
    for (const row of rows) byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
    return { available: true, last24h: rows.length, posts24h: posts.length, byOutcome, lastCallAt: rows[0]?.received_at || null, lastPostAt: posts[0]?.received_at || null, recent: rows.slice(0, 5) };
  } catch (error) {
    return { available: false, error: error?.message || 'sin respuesta' };
  }
}
