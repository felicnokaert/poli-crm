// Adaptador OPCIONAL de Google Places (API nueva, Text Search) para Prospección.
// Está APAGADO por defecto: solo funciona si se configuran las tres cosas a la vez
// (PROSPECT_GOOGLE_ENABLED=true, GOOGLE_PLACES_API_KEY y un tope diario) y falla
// "cerrado": ante cualquier duda (sin contador, error, tope alcanzado) NO consulta.
// Google cobra por consulta, por eso el tope diario es duro y se descuenta ANTES de llamar.
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.location,places.primaryTypeDisplayName';
const HARD_MAX_CAP = 200;

export function googleConfig(env = process.env) {
  const cap = Math.min(Math.max(Math.floor(Number(env.PROSPECT_GOOGLE_DAILY_CAP) || 0), 0), HARD_MAX_CAP);
  const enabled = String(env.PROSPECT_GOOGLE_ENABLED || '').toLowerCase() === 'true' && Boolean(env.GOOGLE_PLACES_API_KEY) && cap > 0
    && Boolean(env.SUPABASE_URL || env.VITE_SUPABASE_URL) && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  return { enabled, cap };
}

// Descuenta un cupo del día (atómico, en la base). Cualquier error = sin cupo.
export async function takeQuota(env = process.env, http = fetch, now = new Date()) {
  const { enabled, cap } = googleConfig(env);
  if (!enabled) return { ok: false, reason: 'off' };
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL).replace(/\/$/, '');
  try {
    const response = await http(`${base}/rest/v1/rpc/prospect_quota_take`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_day: now.toISOString().slice(0, 10), p_cap: cap }),
    });
    if (!response.ok) return { ok: false, reason: 'error' };
    return (await response.json()) === true ? { ok: true, cap } : { ok: false, reason: 'cap', cap };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export function normalizeGoogle(payload, { zoneName = '', province = '', family = '' } = {}) {
  return (payload?.places || []).filter((place) => place?.displayName?.text).map((place) => ({
    company: place.displayName.text,
    family,
    rubro: place.primaryTypeDisplayName?.text || '',
    address: place.formattedAddress || '',
    city: zoneName,
    province,
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || '',
    website: place.websiteUri || '',
    email: '',
    instagram: '',
    facebook: '',
    lat: place.location?.latitude ?? null,
    lon: place.location?.longitude ?? null,
    osmId: '',
    googleId: place.id || '',
    source: 'Google Maps',
  }));
}

export async function searchGoogle({ query, lat, lon, radiusKm }, env = process.env, http = fetch) {
  const started = Date.now();
  try {
    const response = await http(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'es',
        regionCode: 'AR',
        pageSize: 20,
        locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: Math.min(Math.max(radiusKm, 1), 30) * 1000 } },
      }),
    });
    if (!response.ok) return { ok: false, ms: Date.now() - started, error: `Google Maps rechazó la consulta (error ${response.status}).` };
    return { ok: true, ms: Date.now() - started, data: await response.json() };
  } catch {
    return { ok: false, ms: Date.now() - started, error: 'No se pudo conectar con Google Maps.' };
  }
}
