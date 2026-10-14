// Diagnóstico de la conexión con Meta, hecho desde el servidor con el token del
// usuario técnico. Responde, sin exponer el token, lo que hoy hay que adivinar
// mirando paneles: a qué cuentas llega el token, a qué negocio pertenece cada
// una, si el número está en la Cloud API y qué app recibe sus webhooks.
const GRAPH = 'https://graph.facebook.com/v23.0';

async function graph(path, token, http) {
  try {
    const result = await http(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await result.json();
    if (!result.ok || body.error) return { ok: false, error: body.error?.message || `HTTP ${result.status}` };
    return { ok: true, data: body };
  } catch (error) {
    return { ok: false, error: error?.message || 'sin respuesta de Meta' };
  }
}

function tokenSummary(debug) {
  if (!debug.ok) return { error: debug.error };
  const info = debug.data?.data || {};
  return {
    appId: info.app_id ?? null,
    app: info.application ?? null,
    type: info.type ?? null,
    isValid: info.is_valid ?? null,
    expiresAt: info.expires_at ?? null,
    scopes: info.scopes ?? [],
    granularScopes: (info.granular_scopes || []).map((item) => ({
      scope: item.scope,
      targetIds: item.target_ids ?? 'todos los objetos',
    })),
  };
}

// true/false si el token lista explícitamente la cuenta; 'todos' si el permiso
// aplica a todos los objetos; null si no se pudo leer el token.
export function tokenCoversWaba(summary, wabaId) {
  if (!summary || summary.error) return null;
  const scope = (summary.granularScopes || []).find((item) => item.scope === 'whatsapp_business_management');
  if (!scope) return false;
  if (!Array.isArray(scope.targetIds)) return 'todos';
  return scope.targetIds.map(String).includes(String(wabaId));
}

export async function diagnoseMeta({ token, wabas, http = fetch }) {
  const debug = await graph(`/debug_token?input_token=${encodeURIComponent(token)}`, token, http);
  const tokenInfo = tokenSummary(debug);
  const accounts = await Promise.all(
    Object.entries(wabas).map(async ([channel, wabaId]) => {
      const [account, numbers, apps] = await Promise.all([
        graph(`/${wabaId}?fields=id,name,owner_business_info`, token, http),
        graph(`/${wabaId}/phone_numbers?fields=id,display_phone_number,status,platform_type,account_mode,name_status,quality_rating,webhook_configuration,health_status`, token, http),
        graph(`/${wabaId}/subscribed_apps`, token, http),
      ]);
      return {
        channel,
        wabaId,
        tokenCovers: tokenCoversWaba(tokenInfo, wabaId),
        account: account.ok
          ? { name: account.data.name ?? null, owner: account.data.owner_business_info?.name ?? null }
          : { error: account.error },
        phoneNumbers: numbers.ok
          ? (numbers.data.data || []).map((item) => ({
              id: item.id,
              number: item.display_phone_number,
              status: item.status,
              platformType: item.platform_type,
              accountMode: item.account_mode,
              nameStatus: item.name_status,
              quality: item.quality_rating,
              // Si el número tiene su propia URL de webhook, Meta la usa en vez de la de la app.
              // Estado de salud de Meta para enviar y recibir (puede mostrar bloqueos o errores).
              health: item.health_status ? { canSend: item.health_status.can_send_message, errors: (item.health_status.entities || []).flatMap((entity) => entity.errors || []).map((error) => error.error_description || error.error_code) } : null,
              webhookOverride: item.webhook_configuration?.phone_number || item.webhook_configuration?.whatsapp_business_account || null,
            }))
          : { error: numbers.error },
        // URL propia de la cuenta (pisa a la de la app) si la hay.
        wabaWebhookOverride: apps.ok
          ? (apps.data.data || []).map((item) => item.override_callback_uri || item.whatsapp_business_api_data?.override_callback_uri).filter(Boolean)
          : null,
        subscribedApps: apps.ok
          ? (apps.data.data || []).map((item) => item.whatsapp_business_api_data?.name || item.whatsapp_business_api_data?.id || 'app sin nombre')
          : { error: apps.error },
      };
    }),
  );
  return { token: tokenInfo, accounts };
}

// Webhook de la app (no de la cuenta): a qué URL y con qué campos le avisa Meta al CRM.
// Se consulta con el token de la propia app (id|secreto), que además prueba que el
// secreto guardado en el CRM sigue siendo el vigente. Nunca se devuelve el secreto.
const WEBHOOK_OBJECT = 'whatsapp_business_account';

async function appGraph(path, { appId, appSecret }, http, init = {}) {
  const separator = path.includes('?') ? '&' : '?';
  try {
    const result = await http(`${GRAPH}${path}${separator}access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`, init);
    const body = await result.json();
    if (!result.ok || body.error) return { ok: false, error: body.error?.message || `HTTP ${result.status}` };
    return { ok: true, data: body };
  } catch (error) {
    return { ok: false, error: error?.message || 'sin respuesta de Meta' };
  }
}

export async function webhookStatus({ appId, appSecret, expectedUrl, http = fetch }) {
  if (!appId || !appSecret) return { error: 'Falta el id de la app o su secreto en el CRM.' };
  const result = await appGraph('/' + appId + '/subscriptions', { appId, appSecret }, http);
  if (!result.ok) return { error: result.error, secretRejected: /secret|signature|validating/i.test(result.error) };
  const item = (result.data.data || []).find((entry) => entry.object === WEBHOOK_OBJECT);
  if (!item) return { subscribed: false, note: 'La app no tiene webhook de WhatsApp Business configurado.' };
  const fields = (item.fields || []).map((field) => field.name);
  return {
    subscribed: true,
    active: item.active !== false,
    callbackUrl: item.callback_url,
    urlOk: expectedUrl ? item.callback_url === expectedUrl : null,
    fields,
    messagesField: fields.includes('messages'),
  };
}

// Vuelve a dejar el webhook de la app apuntando al CRM y con el campo `messages`.
// Meta verifica la URL con un GET (el CRM responde con el token de verificación).
export async function repairWebhook({ appId, appSecret, callbackUrl, verifyToken, http = fetch }) {
  if (!appId || !appSecret || !verifyToken) return { ok: false, error: 'Falta el id de la app, su secreto o el token de verificación.' };
  const body = new URLSearchParams({ object: WEBHOOK_OBJECT, callback_url: callbackUrl, fields: 'messages', verify_token: verifyToken });
  const result = await appGraph('/' + appId + '/subscriptions', { appId, appSecret }, http, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
