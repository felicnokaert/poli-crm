import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';
import { createOAuthState, MERCADOLIBRE_ACCOUNTS } from '../lib/mercadolibre.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  const accountKey = request.body?.accountKey;
  if (!MERCADOLIBRE_ACCOUNTS[accountKey]) return response.status(400).json({ error: 'Cuenta no válida.' });
  const { MELI_CLIENT_ID, MELI_REDIRECT_URI, MELI_OAUTH_STATE_SECRET } = process.env;
  if (!MELI_CLIENT_ID || !MELI_REDIRECT_URI || !MELI_OAUTH_STATE_SECRET) {
    return response.status(503).json({ error: 'La integración todavía no tiene configuradas las credenciales de Mercado Libre.' });
  }
  const state = createOAuthState({ accountKey, userId: user.id }, MELI_OAUTH_STATE_SECRET);
  const url = new URL('https://auth.mercadolibre.com.ar/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', MELI_CLIENT_ID);
  url.searchParams.set('redirect_uri', MELI_REDIRECT_URI);
  url.searchParams.set('state', state);
  return response.status(200).json({ authorizationUrl: url.toString(), accountKey });
}
