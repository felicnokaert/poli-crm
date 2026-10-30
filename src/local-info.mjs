// Hora en vivo y clima de lugares (Open-Meteo: gratis y sin clave). Solo lógica; la red va en el componente.
export const HOME_TZ = 'America/Argentina/Buenos_Aires';
export const DEFAULT_PLACES = [
  { name: 'Mar del Plata', latitude: -38.0055, longitude: -57.5426, timezone: HOME_TZ },
  { name: 'Villa Domínico', latitude: -34.6930, longitude: -58.3290, timezone: HOME_TZ },
];

export function timeIn(timezone = HOME_TZ, now = new Date()) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(now);
}

// Códigos WMO de Open-Meteo -> [texto, ícono]
export function describeWeather(code) {
  const c = Number(code);
  if (c === 0) return ['Despejado', '☀️'];
  if (c <= 2) return ['Algo nublado', '🌤️'];
  if (c === 3) return ['Nublado', '☁️'];
  if (c === 45 || c === 48) return ['Niebla', '🌫️'];
  if (c >= 51 && c <= 57) return ['Llovizna', '🌦️'];
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ['Lluvia', '🌧️'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['Nieve', '🌨️'];
  if (c >= 95) return ['Tormenta', '⛈️'];
  return ['Variable', '🌡️'];
}

export const weatherUrl = (place) => `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`;
export const geocodeUrl = (text, count = 1) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(text).trim())}&count=${count}&language=es&format=json`;

export function parseWeather(json) {
  const cur = json?.current;
  if (!cur || typeof cur.temperature_2m !== 'number') return null;
  const [label, icon] = describeWeather(cur.weather_code);
  return { temp: Math.round(cur.temperature_2m), label, icon, timezone: json.timezone || HOME_TZ };
}

export function parseGeocode(json) {
  const hit = json?.results?.[0];
  if (!hit) return null;
  return { name: [hit.name, hit.admin1].filter(Boolean).join(', '), latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone || HOME_TZ };
}

// Varias sugerencias para el buscador de ciudades (mientras se escribe).
export function parseGeocodeList(json) {
  return (json?.results || []).map((hit) => ({
    name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone || HOME_TZ,
  }));
}
