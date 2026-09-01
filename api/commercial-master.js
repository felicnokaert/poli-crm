import { COMMERCIAL_MASTER_CLIENTS } from '../lib/commercial-master-data.mjs';

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
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método no permitido.' });
  const user = await authenticatedUser(request);
  if (!user) return response.status(401).json({ error: 'Acceso corporativo requerido.' });
  response.setHeader('Cache-Control', 'private, no-store');
  return response.status(200).json({ version: '2026-09-01-v2', clients: COMMERCIAL_MASTER_CLIENTS });
}
