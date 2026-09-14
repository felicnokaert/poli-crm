import { handleReadiness } from '../lib/readiness.mjs';

async function checkDatabase(environment = process.env, request = fetch) {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const result = await request(`${url}/rest/v1/whatsapp_events?select=event_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return result.ok;
  } catch {
    return false;
  }
}

async function handleHealth(_request, response) {
  const databaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return response.status(200).json({
    ok: true,
    database: databaseConfigured,
    databaseReachable: await checkDatabase(),
    metaWebhook: Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET),
    generalChannel: Boolean(process.env.WHATSAPP_GENERAL_PHONE_ID),
    penosilChannel: Boolean(process.env.WHATSAPP_PENOSIL_PHONE_ID),
    browserBridge: Boolean(process.env.WHATSAPP_BRIDGE_TOKEN),
    simulator: Boolean(process.env.COPILOT_SIMULATOR_TOKEN),
  });
}

// El plan Hobby de Vercel permite como mucho 12 Serverless Functions por
// deployment (cada archivo bajo api/ cuenta como una) - el 13er archivo
// (api/readiness.js) hizo que TODO deploy fallara desde hace 3 días con
// errorCode "exceeded_serverless_functions_per_deployment", sin que
// apareciera como error de build (el build en sí termina bien; Vercel
// rechaza el deployment recién en el paso de armar las funciones).
//
// En vez de sacar funcionalidad real o cambiar de plan (decisión de
// Felipe, no técnica), se fusiona /api/readiness dentro de este mismo
// archivo. Un rewrite en vercel.json ("/api/readiness" -> "/api/health")
// hace que ambas URLs sigan funcionando exactamente igual para quien las
// llame (App.jsx sigue pidiendo /api/readiness sin cambios) - Vercel
// preserva el pathname original pedido en request.url incluso después de
// un rewrite, así que alcanza con mirarlo acá para saber qué lógica
// correr. La lógica de readiness se movió a lib/readiness.mjs (no cuenta
// como función propia por no vivir bajo api/) en vez de vivir inline acá,
// para que test/api.test.mjs la pueda seguir testeando en aislamiento.
export default async function handler(request, response) {
  const path = String(request.url || '').split('?')[0];
  if (path === '/api/readiness') return handleReadiness(request, response);
  return handleHealth(request, response);
}
