import { authenticatedCorporateUser, serviceHeaders } from '../lib/corporate-auth.mjs';
import { normalizeItem, openToken, sealToken } from '../lib/mercadolibre.mjs';

async function refreshAccess(account, environment) {
  const refreshToken = openToken(account.refresh_token_ciphertext, environment.MELI_TOKEN_ENCRYPTION_KEY);
  const result = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: environment.MELI_CLIENT_ID,
      client_secret: environment.MELI_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  const token = await result.json();
  if (!result.ok || !token.access_token || !token.refresh_token) throw new Error('Mercado Libre requiere volver a autorizar esta cuenta.');
  const changes = {
    access_token_ciphertext: sealToken(token.access_token, environment.MELI_TOKEN_ENCRYPTION_KEY),
    refresh_token_ciphertext: sealToken(token.refresh_token, environment.MELI_TOKEN_ENCRYPTION_KEY),
    token_expires_at: new Date(Date.now() + Number(token.expires_in || 21600) * 1000).toISOString(),
    status: 'connected',
    updated_at: new Date().toISOString(),
  };
  const saved = await fetch(`${environment.SUPABASE_URL}/rest/v1/mercadolibre_accounts?id=eq.${account.id}`, {
    method: 'PATCH',
    headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(changes),
  });
  if (!saved.ok) throw new Error('No se pudieron renovar las credenciales de Mercado Libre.');
  return token.access_token;
}

async function itemIds(sellerId, accessToken) {
  let url = `https://api.mercadolibre.com/users/${encodeURIComponent(sellerId)}/items/search?search_type=scan&limit=100`;
  const ids = [];
  for (let page = 0; page < 50 && url; page += 1) {
    const result = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await result.json();
    if (!result.ok) throw new Error(body.message || 'No se pudieron consultar las publicaciones.');
    ids.push(...(body.results || []).map(String));
    url = body.scroll_id && body.results?.length
      ? `https://api.mercadolibre.com/users/${encodeURIComponent(sellerId)}/items/search?search_type=scan&limit=100&scroll_id=${encodeURIComponent(body.scroll_id)}`
      : null;
  }
  return [...new Set(ids)];
}

async function itemDetails(ids, accessToken) {
  const items = [];
  for (let index = 0; index < ids.length; index += 20) {
    const batch = ids.slice(index, index + 20);
    const result = await fetch(`https://api.mercadolibre.com/items?ids=${batch.join(',')}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await result.json();
    if (!result.ok) throw new Error('No se pudo descargar el detalle de las publicaciones.');
    items.push(...body.filter((entry) => entry.code === 200 && entry.body).map((entry) => entry.body));
  }
  return items;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  const accountKey = request.body?.accountKey;
  const environment = process.env;
  const accountResult = await fetch(`${environment.SUPABASE_URL}/rest/v1/mercadolibre_accounts?account_key=eq.${encodeURIComponent(accountKey || '')}&select=*&limit=1`, { headers: serviceHeaders() });
  const accounts = accountResult.ok ? await accountResult.json() : [];
  const account = accounts[0];
  if (!account) return response.status(404).json({ error: 'La cuenta todavía no está conectada.' });
  try {
    const expiring = Date.parse(account.token_expires_at) < Date.now() + 60_000;
    const accessToken = expiring
      ? await refreshAccess(account, environment)
      : openToken(account.access_token_ciphertext, environment.MELI_TOKEN_ENCRYPTION_KEY);
    const ids = await itemIds(account.seller_id, accessToken);
    const details = await itemDetails(ids, accessToken);
    const rows = details.map((item) => normalizeItem(item, account.id));
    for (let index = 0; index < rows.length; index += 100) {
      const saved = await fetch(`${environment.SUPABASE_URL}/rest/v1/mercadolibre_items?on_conflict=account_id,item_id`, {
        method: 'POST',
        headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(rows.slice(index, index + 100)),
      });
      if (!saved.ok) throw new Error('No se pudieron guardar todas las publicaciones sincronizadas.');
    }
    const stamp = new Date().toISOString();
    await fetch(`${environment.SUPABASE_URL}/rest/v1/mercadolibre_accounts?id=eq.${account.id}`, {
      method: 'PATCH', headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }), body: JSON.stringify({ last_synced_at: stamp, status: 'connected', updated_at: stamp }),
    });
    return response.status(200).json({ ok: true, accountKey, items: rows.length, syncedAt: stamp });
  } catch (error) {
    if (/volver a autorizar/i.test(error.message || '')) {
      await fetch(`${environment.SUPABASE_URL}/rest/v1/mercadolibre_accounts?id=eq.${account.id}`, {
        method: 'PATCH', headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }), body: JSON.stringify({ status: 'reauthorization_required', updated_at: new Date().toISOString() }),
      });
    }
    return response.status(502).json({ error: error.message || 'No se pudo sincronizar Mercado Libre.' });
  }
}

