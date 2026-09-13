import { authenticatedCorporateUser, serviceHeaders } from '../lib/corporate-auth.mjs';
import { withRetry } from '../lib/retry.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.MELI_CLIENT_ID) return response.status(200).json({ configured: false, accounts: [] });
  // Lectura simple (GET) contra Supabase - segura para reintentar ante un
  // 5xx pasajero o un corte de red, mismo criterio que el resto de las
  // lecturas server-side (ver api/cron-daily-maintenance.js). withRetry
  // relanza el error si el último intento fue un throw (corte de red total),
  // así que envolvemos en try/catch para devolver el mismo 503 de siempre en
  // vez de dejar que la función serverless explote sin un JSON prolijo.
  try {
    const result = await withRetry(async () => {
      let response2;
      try {
        response2 = await fetch(`${process.env.SUPABASE_URL}/rest/v1/mercadolibre_accounts?select=id,account_key,account_label,seller_id,nickname,site_id,status,last_synced_at,updated_at&order=account_label`, {
          headers: serviceHeaders(),
        });
      } catch (error) {
        return { ok: false, threw: true, error };
      }
      if (!response2.ok) return { ok: false, status: response2.status };
      return { ok: true, accounts: await response2.json() };
    });
    if (!result.ok) return response.status(503).json({ error: 'No se pudo leer el estado de Mercado Libre.' });
    return response.status(200).json({ configured: true, accounts: result.accounts });
  } catch {
    return response.status(503).json({ error: 'No se pudo leer el estado de Mercado Libre.' });
  }
}

