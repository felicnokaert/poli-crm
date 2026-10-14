// Plan diario de prospección: qué familia toca hoy, en qué zonas buscar y qué
// zonas ya se recorrieron, para no repetir. Es una guía editable, no una regla
// cerrada: el usuario puede elegir otra familia o zona cuando quiera.
import { PROSPECT_FAMILIES, familyIsActive } from './prospect-model.mjs';

export const DAILY_TARGET = { min: 30, max: 50 };
// Una zona "agotada" vuelve a ofrecerse pasado este tiempo (nunca es definitiva).
export const REVIEW_AFTER_DAYS = 60;

const CABA = '02';
const BUENOS_AIRES = '06';
const MAR_DEL_PLATA = { lat: -38.0055, lon: -57.5426 };
const IMPERPUR_RADIUS_KM = 250;

// Alcance geográfico por familia. Por defecto, todo el país.
//  - Baldes: solo CABA y provincia de Buenos Aires (costo de envío).
//  - Carrozados Imperpur: Costa Atlántica y hasta 250 km de Mar del Plata, sin CABA.
const SCOPES = {
  Baldes: (zone) => zone.prov === CABA || zone.prov === BUENOS_AIRES,
  'Carrozados Imperpur': (zone) => zone.prov !== CABA && distanceKm(MAR_DEL_PLATA, zone) <= IMPERPUR_RADIUS_KM,
};

export function distanceKm(a, b) {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function scopeDescription(family) {
  if (family === 'Baldes') return 'CABA y provincia de Buenos Aires';
  if (family === 'Carrozados Imperpur') return `Costa Atlántica y hasta ${IMPERPUR_RADIUS_KM} km de Mar del Plata (sin CABA)`;
  return 'Todo el país';
}

export function zonesForFamily(family, cities = []) {
  const inScope = SCOPES[family] || (() => true);
  return cities.filter((city) => city && Number.isFinite(city.lat) && Number.isFinite(city.lon) && inScope(city)).sort((a, b) => b.pob - a.pob);
}

// Cuántos días hábiles (lunes a viernes) pasaron desde una fecha fija: sirve
// para rotar las familias de forma determinista, una por día.
function businessDayNumber(date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const epoch = new Date(Date.UTC(2026, 0, 5)); // lunes
  const days = Math.floor((day - epoch) / 86400000);
  const weeks = Math.floor(days / 7);
  const weekday = ((days % 7) + 7) % 7;
  return weeks * 5 + Math.min(weekday, 4);
}

export function rotationFamilies(switches = {}) {
  return PROSPECT_FAMILIES.filter((item) => familyIsActive(item.key, switches) && !item.venta_cruzada).map((item) => item.key);
}

// Familia sugerida para una fecha: una por día hábil, en rotación.
export function familyForDate(date = new Date(), switches = {}) {
  const families = rotationFamilies(switches);
  if (!families.length) return '';
  return families[((businessDayNumber(date) % families.length) + families.length) % families.length];
}

export function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Estado de una zona para una familia, según el registro de búsquedas.
export function zoneStatus(family, zoneId, searches = [], today = new Date().toISOString().slice(0, 10)) {
  const entries = searches.filter((item) => item.family === family && item.zoneId === zoneId).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!entries.length) return { status: 'Pendiente', found: 0, lastDate: '' };
  const found = entries.reduce((sum, item) => sum + (Number(item.found) || 0), 0);
  const last = entries.at(-1);
  const exhausted = entries.filter((item) => item.exhausted).at(-1);
  if (exhausted) {
    const reviewDate = addDaysIso(exhausted.date, REVIEW_AFTER_DAYS);
    if (today < reviewDate) return { status: 'Agotada por ahora', found, lastDate: last.date, reviewDate };
    return { status: 'Pendiente', found, lastDate: last.date, review: true };
  }
  return { status: 'En curso', found, lastDate: last.date };
}

// Próximas zonas a buscar: primero las que nunca se buscaron (de mayor a menor
// población), después las que están en curso. Las agotadas esperan su revisión.
export function suggestZones(family, cities, searches = [], { count = 3, today } = {}) {
  const zones = zonesForFamily(family, cities);
  const withStatus = zones.map((zone) => ({ zone, ...zoneStatus(family, zone.id, searches, today) }));
  const pending = withStatus.filter((item) => item.status === 'Pendiente');
  const inProgress = withStatus.filter((item) => item.status === 'En curso');
  return [...pending, ...inProgress].slice(0, count);
}
