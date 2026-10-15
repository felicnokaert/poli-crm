// Búsqueda de prospectos en OpenStreetMap (Overpass API): gratis, sin clave.
// Se arma la consulta por zona (centro + radio) y por rubros, y se normaliza la
// respuesta al formato de prospecto del CRM. NO se probó contra el servicio real
// desde el entorno de desarrollo (la red bloquea esos dominios): ante cualquier
// falla se devuelve un mensaje claro y no se inventan resultados.
export const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const USER_AGENT = 'PoliplastCRM-Prospeccion/1.0 (felipecnokaert@gmail.com)';
const MAX_RESULTS = 200;

// Rubro -> etiquetas de OpenStreetMap. Es un punto de partida editable: lo que
// no figura acá se busca igual por palabras en el nombre del comercio.
const RUBRO_TAGS = {
  'ferretería': [['shop', 'hardware']],
  'corralón': [['shop', 'doityourself'], ['shop', 'trade'], ['shop', 'building_materials']],
  'materiales de construcción': [['shop', 'doityourself'], ['shop', 'building_materials'], ['shop', 'trade']],
  'pinturería': [['shop', 'paint']],
  'distribuidora ferretera': [['shop', 'trade'], ['shop', 'hardware']],
  'carnicería': [['shop', 'butcher']],
  'fiambrería': [['shop', 'deli']],
  'rotisería': [['shop', 'deli'], ['amenity', 'fast_food']],
  'panadería': [['shop', 'bakery']],
  'distribuidora de lácteos o congelados': [['shop', 'dairy'], ['shop', 'frozen_food']],
  'heladería': [['amenity', 'ice_cream'], ['shop', 'ice_cream']],
  'cervecería': [['craft', 'brewery'], ['man_made', 'brewery']],
  'destilería': [['craft', 'distillery']],
  'café de especialidad': [['craft', 'coffee_roaster']],
  growshop: [['shop', 'hydroponics']],
  hidroponia: [['shop', 'hydroponics']],
  'fábrica de piscinas': [['shop', 'swimming_pool']],
  astillero: [['industrial', 'shipyard'], ['craft', 'boatbuilder']],
};

// Solo letras, números, espacios y acentos: nada que pueda romper la consulta.
export function safeWord(value = '') {
  return String(value).normalize('NFC').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export { radiusForPopulation } from '../src/prospect-radius.mjs';

// Raíz de la palabra principal del rubro, tolerante a tildes: "ferretería" -> "ferreter[ií]..." (Overpass distingue tildes).
const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'para', 'con']);
export function nameStem(rubro = '') {
  const word = rubro.toLocaleLowerCase('es-AR').split(' ').filter((item) => item.length > 3 && !STOP_WORDS.has(item)).sort((a, b) => b.length - a.length)[0];
  const text = rubro.toLocaleLowerCase('es-AR').trim();
  if (!word && !text) return '';
  const base = word || text;
  const trimmed = base.replace(/(ía|ia|es|s|o|a)$/u, '');
  const stem = trimmed.length >= 4 ? trimmed : base;
  return stem.replace(/[aáàä]/g, '[aá]').replace(/[eéèë]/g, '[eé]').replace(/[iíìï]/g, '[ií]').replace(/[oóòö]/g, '[oó]').replace(/[uúùü]/g, '[uúü]');
}

export function buildOverpassQuery({ lat, lon, radiusKm, rubros = [] }) {
  const meters = Math.round(Math.min(Math.max(Number(radiusKm) || 5, 1), 30) * 1000);
  const around = `(around:${meters},${Number(lat).toFixed(5)},${Number(lon).toFixed(5)})`;
  const clauses = new Set();
  const words = [];
  for (const rubro of rubros.map(safeWord).filter(Boolean).slice(0, 12)) {
    const tags = RUBRO_TAGS[rubro.toLocaleLowerCase('es-AR')] || [];
    for (const [key, value] of tags) clauses.add(`nwr["${key}"="${value}"]${around};`);
    // Muchos comercios argentinos están en OpenStreetMap sin etiqueta de rubro: también se busca por el nombre.
    const stem = nameStem(rubro);
    if (stem) words.push(stem);
  }
  if (words.length) clauses.add(`nwr["name"~"${[...new Set(words)].join('|')}",i]${around};`);
  return `[out:json][timeout:25];(${[...clauses].join('')});out center tags ${MAX_RESULTS};`;
}

// Dos consultas livianas en vez de una pesada: (1) etiquetas de rubro, rápida; (2) palabras del nombre.
// Con caja geográfica (bbox), mucho más barata para Overpass que un círculo con expresión regular.
// Si una falla y la otra anda, se devuelve lo que hay en vez de perder todo.
export function buildOverpassStages({ lat, lon, radiusKm, rubros = [] }) {
  const km = Math.min(Math.max(Number(radiusKm) || 5, 1), 30);
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((Number(lat) * Math.PI) / 180));
  const box = `(${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)})`;
  const tagClauses = new Set();
  const words = [];
  for (const rubro of rubros.map(safeWord).filter(Boolean).slice(0, 12)) {
    for (const [key, value] of RUBRO_TAGS[rubro.toLocaleLowerCase('es-AR')] || []) tagClauses.add(`nwr["${key}"="${value}"]${box};`);
    const stem = nameStem(rubro);
    if (stem) words.push(stem);
  }
  const tags = tagClauses.size ? `[out:json][timeout:15];(${[...tagClauses].join('')});out center tags ${MAX_RESULTS};` : null;
  const names = words.length ? `[out:json][timeout:20];nwr["name"~"${[...new Set(words)].join('|')}",i]${box};out center tags ${MAX_RESULTS};` : null;
  return { tags, names };
}

function firstTag(tags, keys) {
  for (const key of keys) if (tags[key]) return String(tags[key]).split(';')[0].trim();
  return '';
}

function rubroFromTags(tags) {
  const labels = {
    hardware: 'ferretería', doityourself: 'corralón / materiales', trade: 'distribuidora', building_materials: 'materiales de construcción',
    paint: 'pinturería', butcher: 'carnicería', deli: 'fiambrería', bakery: 'panadería', dairy: 'lácteos', frozen_food: 'congelados',
    hydroponics: 'hidroponia / growshop', swimming_pool: 'piscinas', ice_cream: 'heladería',
  };
  return labels[tags.shop] || (tags.craft ? String(tags.craft).replace(/_/g, ' ') : '') || (tags.industrial ? String(tags.industrial) : '') || '';
}

export function normalizeOverpass(response, { zoneName = '', province = '', family = '' } = {}) {
  const seen = new Set();
  const results = [];
  for (const element of response?.elements || []) {
    const tags = element.tags || {};
    const name = String(tags.name || '').trim();
    const osmId = `${element.type}/${element.id}`;
    if (!name || seen.has(osmId)) continue;
    seen.add(osmId);
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    results.push({
      company: name,
      family,
      rubro: rubroFromTags(tags),
      address: street,
      city: tags['addr:city'] || zoneName,
      province,
      phone: firstTag(tags, ['phone', 'contact:phone', 'contact:mobile', 'mobile']),
      website: firstTag(tags, ['website', 'contact:website', 'url']),
      email: firstTag(tags, ['email', 'contact:email']),
      instagram: firstTag(tags, ['contact:instagram', 'instagram']),
      facebook: firstTag(tags, ['contact:facebook', 'facebook']),
      lat: element.lat ?? element.center?.lat ?? null,
      lon: element.lon ?? element.center?.lon ?? null,
      osmId,
      source: 'OpenStreetMap',
    });
  }
  return results;
}

// Mensajes en español para cada tipo de falla: qué pasó y qué hacer.
const FAILURES = {
  rate_limit: 'OpenStreetMap está limitando las consultas (demasiados pedidos seguidos). Esperá uno o dos minutos y probá de nuevo.',
  timeout: 'OpenStreetMap tardó demasiado en responder. Probá con una zona más chica, con menos rubros o un poco más tarde.',
  server: 'El servicio de OpenStreetMap tuvo un problema. Probá de nuevo en un rato.',
  network: 'No se pudo conectar con OpenStreetMap. Probá de nuevo en un rato.',
};

// 3 servidores x 17 s entran en los 60 s de la función (vercel.json). Overpass a veces tarda 15-20 s en consultas grandes.
const ATTEMPT_TIMEOUTS_MS = [17000, 17000, 17000];
export const STAGE_TIMEOUTS_MS = { tags: [10000, 10000, 10000], names: [10000, 10000, 10000] };

function hostOf(endpoint) {
  try { return new URL(endpoint).hostname; } catch { return endpoint; }
}

// Consulta a Overpass probando los servidores en orden. Reintenta con el
// siguiente ante límite de pedidos (429), errores del servidor (5xx), tiempo
// agotado o falta de conexión; con una consulta rechazada (4xx) no reintenta.
// Devuelve cuántos intentos hizo y cuánto tardó, para el diagnóstico.
export async function searchOverpass(query, http = fetch, endpoints = OVERPASS_ENDPOINTS, timeouts = ATTEMPT_TIMEOUTS_MS) {
  const started = Date.now();
  let attempts = 0;
  let kind = 'network';
  let lastStatus = null;
  for (const [index, endpoint] of endpoints.entries()) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeouts[index] ?? timeouts.at(-1) ?? 12000);
    try {
      const response = await http(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      lastStatus = response.status;
      if (response.status === 429) { kind = 'rate_limit'; continue; }
      if (response.status === 504 || response.status === 408) { kind = 'timeout'; continue; }
      if (response.status >= 500) { kind = 'server'; continue; }
      if (!response.ok) {
        return { ok: false, kind: 'rejected', attempts, ms: Date.now() - started, error: `OpenStreetMap rechazó la consulta (error ${response.status}). Probá con otros rubros o con otra zona.` };
      }
      const data = await response.json();
      // Overpass a veces responde 200 con un aviso de que se quedó sin tiempo o memoria.
      if (!(data?.elements || []).length && /runtime error|timed out|out of memory/i.test(String(data?.remark || ''))) { kind = 'timeout'; continue; }
      return { ok: true, data, attempts, ms: Date.now() - started, endpoint: hostOf(endpoint) };
    } catch (error) {
      kind = error?.name === 'AbortError' ? 'timeout' : 'network';
    } finally {
      clearTimeout(timer);
    }
  }
  const details = [attempts > 1 ? `se probaron ${attempts} servidores` : '', kind === 'server' && lastStatus ? `respuesta ${lastStatus}` : ''].filter(Boolean);
  return { ok: false, kind, attempts, ms: Date.now() - started, error: `${FAILURES[kind]}${details.length ? ` (${details.join(', ')})` : ''}` };
}

// Resumen de lo que devolvió la fuente, para compararla (por ejemplo contra Google Maps).
export function summarizeResults(results = []) {
  return {
    returned: results.length,
    withPhone: results.filter((item) => item.phone).length,
    withWebsite: results.filter((item) => item.website).length,
  };
}
