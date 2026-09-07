import { serviceHeaders } from '../lib/corporate-auth.mjs';
import { MERCADOLIBRE_ACCOUNTS, sealToken, verifyOAuthState } from '../lib/mercadolibre.mjs';

function finish(response, status, title, detail) {
  const escape = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  response.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  return response.end(`<!doctype html><meta charset="utf-8"><title>${escape(title)}</title><style>body{font-family:system-ui;max-width:620px;margin:70px auto;padding:24px;color:#263b35}a{color:#b71920}</style><h1>${escape(title)}</h1><p>${escape(detail)}</p><p><a href="/">Volver al CRM</a></p>`);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).end('Método no permitido.');
  try {
    const environment = process.env;
    const state = verifyOAuthState(request.query?.state, environment.MELI_OAUTH_STATE_SECRET);
    if (request.query?.error) return finish(response, 400, 'Autorización cancelada', 'Mercado Libre no autorizó la conexión.');
    if (!request.query?.code) throw new Error('Mercado Libre no devolvió el código de autorización.');

    const tokenResult = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: environment.MELI_CLIENT_ID,
        client_secret: environment.MELI_CLIENT_SECRET,
        code: request.query.code,
        redirect_uri: environment.MELI_REDIRECT_URI,
      }),
    });
    const token = await tokenResult.json();
    if (!tokenResult.ok || !token.access_token || !token.refresh_token) throw new Error(token.message || 'No se pudieron obtener las credenciales.');
    const profileResult = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResult.json();
    if (!profileResult.ok || !profile.id) throw new Error('No se pudo identificar la cuenta autorizada.');

    const row = {
      account_key: state.accountKey,
      account_label: MERCADOLIBRE_ACCOUNTS[state.accountKey],
      seller_id: String(profile.id),
      nickname: profile.nickname || MERCADOLIBRE_ACCOUNTS[state.accountKey],
      site_id: profile.site_id || 'MLA',
      access_token_ciphertext: sealToken(token.access_token, environment.MELI_TOKEN_ENCRYPTION_KEY),
      refresh_token_ciphertext: sealToken(token.refresh_token, environment.MELI_TOKEN_ENCRYPTION_KEY),
      token_expires_at: new Date(Date.now() + Number(token.expires_in || 21600) * 1000).toISOString(),
      status: 'connected',
      connected_by: state.userId,
      updated_at: new Date().toISOString(),
    };
    const saved = await fetch(`${environment.SUPABASE_URL}/rest/v1/mercadolibre_accounts?on_conflict=account_key`, {
      method: 'POST',
      headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(row),
    });
    if (!saved.ok) throw new Error('La cuenta fue autorizada, pero no se pudo guardar la conexión.');
    return finish(response, 200, `${row.account_label} conectada`, `La cuenta ${row.nickname} quedó vinculada en modo de solo lectura.`);
  } catch (error) {
    return finish(response, 400, 'No se pudo conectar Mercado Libre', error.message || 'Error desconocido.');
  }
}
