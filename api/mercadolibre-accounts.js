import { authenticatedCorporateUser, serviceHeaders } from '../lib/corporate-auth.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.MELI_CLIENT_ID) return response.status(200).json({ configured: false, accounts: [] });
  const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/mercadolibre_accounts?select=id,account_key,account_label,seller_id,nickname,site_id,status,last_synced_at,updated_at&order=account_label`, {
    headers: serviceHeaders(),
  });
  if (!result.ok) return response.status(503).json({ error: 'No se pudo leer el estado de Mercado Libre.' });
  return response.status(200).json({ configured: true, accounts: await result.json() });
}

