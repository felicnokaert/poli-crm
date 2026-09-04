import { channelsForEmail } from '../src/user-channels.mjs';

const ALLOWED_BACKUP = 'felipecnokaert@gmail.com';

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
  if (!process.env.WHATSAPP_BRIDGE_TOKEN) return response.status(503).json({ error: 'El puente todavía no está configurado.' });
  const channel = request.body?.channel;
  if (!channelsForEmail(user.email).includes(channel)) return response.status(400).json({ error: 'Canal no válido.' });
  return response.status(200).json({
    ok: true,
    channel,
    endpoint: 'https://poli-crm.vercel.app/api/browser-bridge',
    token: process.env.WHATSAPP_BRIDGE_TOKEN,
  });
}
