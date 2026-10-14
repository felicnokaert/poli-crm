// Búsqueda de prospectos en OpenStreetMap (Overpass API): gratis, sin clave.
// Se arma la consulta por zona (centro + radio) y por rubros, y se normaliza la
// respuesta al formato de prospecto del CRM. NO se probó contra el servicio real
// desde el entorno de desarrollo (la red bloquea esos dominios): ante cualquier
// falla se devuelve un mensaje claro y no se inventan resultados.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
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

export function buildOverpassQuery({ lat, lon, radiusKm, rubros = [] }) {
  const meters = Math.round(Math.min(Math.max(Number(radiusKm) || 5, 1), 30) * 1000);
  const around = `(around:${meters},${Number(lat).toFixed(5)},${Number(lon).toFixed(5)})`;
  const clauses = [];
  const words = [];
  for (const rubro of rubros.map(safeWord).filter(Boolean).slice(0, 12)) {
    for (const [key, value] of RUBRO_TAGS[rubro.toLocaleLowerCase('es-AR')] || []) clauses.push(`nwr["${key}"="${value}"]${around};`);
    words.push(rubro.toLocaleLowerCase('es-AR'));
  }
  if (words.length) {
    // Búsqueda por palabras del nombre ("carrocería", "módulos"…), sin acentos ambiguos.
    const pattern = words.map((word) => word.replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')).join('|');
    clauses.push(`nwr["name"~"${pattern}",i]${around};`);
  }
  return `[out:json][timeout:25];(${clauses.join('')});out center tags ${MAX_RESULTS};`;
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

export async function searchOverpass(query, http = fetch, endpoints = ENDPOINTS) {
  let lastError = 'sin respuesta';
  for (const endpoint of endpoints) {
    try {
      const response = await http(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (response.status === 429 || response.status >= 500) { lastError = `el servicio respondió ${response.status}`; continue; }
      if (!response.ok) return { ok: false, error: `OpenStreetMap respondió ${response.status}.` };
      return { ok: true, data: await response.json() };
    } catch (error) {
      lastError = error?.message || 'sin respuesta';
    }
  }
  return { ok: false, error: `No se pudo consultar OpenStreetMap (${lastError}). Probá de nuevo en un rato.` };
}
