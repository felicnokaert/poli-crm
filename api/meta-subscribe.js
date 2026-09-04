const ALLOWED_BACKUP = 'felipecnokaert@gmail.com';
const WABAS = {
  general: '1620643669067135',
  penosil: '2497921480672168',
  // Número de Juan: vive en una cuenta de WhatsApp Business (WABA) propia,
  // distinta de la de General/Penosil.
  juan: '203972567633203',
};

function allowedEmail(email = '') {
  const normalized = email.toLowerCase();
  return normalized.endsWith('@grupopoliplast.com.ar') || normalized === ALLOWED_BACKUP;
}

async function authenticatedUser(request, environment = process.env, http = fetch) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return null;
  const result = await http(`${environment.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: environment.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!result.ok) return null;
  const user = await result.json();
  return allowedEmail(user.email) ? user : null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  if (!process.env.META_SYSTEM_USER_TOKEN) return response.status(503).json({ error: 'Falta el acceso técnico de Meta.' });

  const channel = request.body?.channel;
  const wabaId = WABAS[channel];
  if (!wabaId) return response.status(400).json({ error: 'Canal no válido.' });

  const result = await fetch(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.META_SYSTEM_USER_TOKEN}` },
  });
  const body = await result.json();
  if (!result.ok || !body.success) return response.status(502).json({ error: 'Meta no pudo suscribir la cuenta.', details: body.error?.message || null });
  return response.status(200).json({ ok: true, channel, connectedBy: user.email });
}
