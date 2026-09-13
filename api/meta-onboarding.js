import { authenticatedCorporateUser } from '../lib/corporate-auth.mjs';

const APP_ID = '857121580457426';
const MAX_CODE_LENGTH = 2048; // los códigos de OAuth de Meta son largos (JWT-like), pero acotados
// Los IDs que devuelve Meta (WABA, número de teléfono) son siempre
// numéricos. Este chequeo de forma evita mandarlos crudos (sin
// encodeURIComponent) a una URL de la Graph API si el body viene manipulado.
const META_ID_PATTERN = /^\d{5,32}$/;

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedCorporateUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.META_APP_SECRET) return response.status(503).json({ error: 'Meta no está configurado.' });

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'Cuerpo de la solicitud inválido.' });
  }
  const { code, onboarding = {} } = body;
  if (typeof code !== 'string' || !code.trim() || code.length > MAX_CODE_LENGTH) {
    return response.status(400).json({ error: 'Falta el código de autorización.' });
  }
  if (onboarding !== null && (typeof onboarding !== 'object' || Array.isArray(onboarding))) {
    return response.status(400).json({ error: 'Datos de onboarding inválidos.' });
  }
  const rawWabaId = onboarding?.waba_id || onboarding?.wabaId;
  if (rawWabaId !== undefined && rawWabaId !== null && (typeof rawWabaId !== 'string' || !META_ID_PATTERN.test(rawWabaId))) {
    return response.status(400).json({ error: 'ID de WABA inválido.' });
  }
  const rawPhoneNumberId = onboarding?.phone_number_id || onboarding?.phoneNumberId;
  if (rawPhoneNumberId !== undefined && rawPhoneNumberId !== null && (typeof rawPhoneNumberId !== 'string' || !META_ID_PATTERN.test(rawPhoneNumberId))) {
    return response.status(400).json({ error: 'ID de número de teléfono inválido.' });
  }

  const tokenUrl = new URL('https://graph.facebook.com/v23.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id', APP_ID);
  tokenUrl.searchParams.set('client_secret', process.env.META_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  const tokenResponse = await fetch(tokenUrl);
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) return response.status(502).json({ error: 'Meta rechazó la autorización.' });

  const wabaId = rawWabaId || null;
  if (wabaId) {
    const subscription = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!subscription.ok) return response.status(502).json({ error: 'El número se autorizó, pero no se pudo suscribir al webhook.' });
  }

  return response.status(200).json({
    ok: true,
    wabaId,
    phoneNumberId: rawPhoneNumberId || null,
    connectedBy: user.email,
  });
}
