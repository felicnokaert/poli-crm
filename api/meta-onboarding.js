const APP_ID = '857121580457426';
const ALLOWED_BACKUP = 'felipecnokaert@gmail.com';

function allowedEmail(email = '') {
  return email.toLowerCase().endsWith('@grupopoliplast.com.ar') || email.toLowerCase() === ALLOWED_BACKUP;
}

async function authenticatedUser(request) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return allowedEmail(user.email) ? user : null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.META_APP_SECRET) return response.status(503).json({ error: 'Meta no está configurado.' });

  const { code, onboarding = {} } = request.body || {};
  if (!code) return response.status(400).json({ error: 'Falta el código de autorización.' });
  const tokenUrl = new URL('https://graph.facebook.com/v23.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id', APP_ID);
  tokenUrl.searchParams.set('client_secret', process.env.META_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  const tokenResponse = await fetch(tokenUrl);
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) return response.status(502).json({ error: 'Meta rechazó la autorización.' });

  const wabaId = onboarding.waba_id || onboarding.wabaId;
  if (wabaId) {
    const subscription = await fetch(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!subscription.ok) return response.status(502).json({ error: 'El número se autorizó, pero no se pudo suscribir al webhook.' });
  }

  return response.status(200).json({
    ok: true,
    wabaId: wabaId || null,
    phoneNumberId: onboarding.phone_number_id || onboarding.phoneNumberId || null,
    connectedBy: user.email,
  });
}
