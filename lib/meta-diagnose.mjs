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
        graph(`/${wabaId}/phone_numbers?fields=id,display_phone_number,status,platform_type,account_mode,name_status,quality_rating`, token, http),
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
            }))
          : { error: numbers.error },
        subscribedApps: apps.ok
          ? (apps.data.data || []).map((item) => item.whatsapp_business_api_data?.name || item.whatsapp_business_api_data?.id || 'app sin nombre')
          : { error: apps.error },
      };
    }),
  );
  return { token: tokenInfo, accounts };
}
