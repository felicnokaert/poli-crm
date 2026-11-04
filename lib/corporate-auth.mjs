const BACKUP_EMAIL = 'felipecnokaert@gmail.com';

export function isCorporateEmail(email = '') {
  const normalized = String(email).trim().toLowerCase();
  return normalized.endsWith('@grupopoliplast.com.ar') || normalized === BACKUP_EMAIL;
}

export async function authenticatedCorporateUser(request, environment = process.env, http = fetch) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) return null;
  const result = await http(`${environment.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: environment.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!result.ok) return null;
  const user = await result.json();
  // 4/11: el mail tiene que estar CONFIRMADO; si no, cualquiera que se registre con un mail de la empresa (sin ser dueño de esa casilla) entraría.
  if (!user.email_confirmed_at && !user.confirmed_at) return null;
  return isCorporateEmail(user.email) ? user : null;
}

export function serviceHeaders(environment = process.env, extra = {}) {
  return {
    apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

