// Cobertura de Prospección por familia: dónde ya hay clientes o prospectos y dónde
// falta. Usa el MISMO cálculo que el mapa de cobertura (calcularAlcance, de
// public/mapa/alcance.mjs): cuántos puntos alcanzan a cada ciudad en línea recta.
// "Déficit" = habitantes por cliente/prospecto de esa familia. Sin datos de la
// familia se ordena por población, como antes.
import { calcularAlcance } from '../public/mapa/alcance.mjs';
import { canonicalFamily } from './families.mjs';
import { familyConfig } from './prospect-model.mjs';
import { zonesForFamily } from './prospect-plan.mjs';

// Radio de alcance para decidir si una zona ya está "cubierta" por un punto. El
// mapa de cobertura usa 100 km por defecto; para prospectar conviene más fino.
export const DEFAULT_COVERAGE_RADIUS_KM = 50;

function plain(value = '') {
  return String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Índice nombre de ciudad -> ciudades (puede haber varias con el mismo nombre).
export function buildCityIndex(cities = []) {
  const index = new Map();
  for (const city of cities) {
    const key = plain(city.nombre);
    index.set(key, [...(index.get(key) || []), city]);
  }
  return index;
}

// Ubica una ciudad por nombre; si hay varias con el mismo nombre usa la provincia
// y, si sigue habiendo dudas, la más poblada.
export function locateCity(index, cityName, provinceName = '', provinces = {}) {
  const matches = index.get(plain(cityName)) || [];
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  const province = plain(provinceName);
  const sameProvince = province ? matches.filter((city) => plain(provinces[city.prov]) === province) : [];
  return [...(sameProvince.length ? sameProvince : matches)].sort((a, b) => b.pob - a.pob)[0];
}

// Puntos (con lat/lon) de una familia: sus prospectos y los clientes del CRM de esa
// familia que no vienen de un prospecto (para no contar dos veces).
export function familyPoints(family, { clients = [], prospects = [], cities = [], provinces = {}, index = buildCityIndex(cities) } = {}) {
  const config = familyConfig(family);
  const crmFamily = config?.crmFamily;
  const points = [];
  const linked = new Set(prospects.map((item) => item.linkedClientId).filter(Boolean));
  const place = (item) => {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) return { lat: item.lat, lon: item.lon, located: 'exacto' };
    const city = locateCity(index, item.city, item.province, provinces);
    return city ? { lat: city.lat, lon: city.lon, located: 'ciudad' } : null;
  };
  for (const prospect of prospects) {
    if (prospect.family !== family) continue;
    const position = place(prospect);
    if (position) points.push({ ...position, kind: 'prospecto', id: prospect.id });
  }
  if (crmFamily) {
    for (const client of clients) {
      if (linked.has(client.id) || canonicalFamily(client.family) !== crmFamily) continue;
      const position = place(client);
      if (position) points.push({ ...position, kind: 'cliente', id: client.id });
    }
  }
  return points;
}

// Zonas de la familia ordenadas por déficit de cobertura: más habitantes por punto
// primero (una zona sin ningún punto cuenta como 1). Sin puntos, por población.
export function deficitRanking(family, cities, points = [], { radiusKm = DEFAULT_COVERAGE_RADIUS_KM } = {}) {
  const zones = zonesForFamily(family, cities);
  if (!points.length) {
    return { base: 'población', zones: zones.map((zone) => ({ zone, n: 0, habPorPunto: zone.pob })) };
  }
  const reach = calcularAlcance(zones, points, radiusKm);
  const rows = reach.ciudades
    .filter((item) => item.ubicada)
    .map((item) => ({ zone: zones.find((zone) => zone.id === item.id), n: item.n, habPorPunto: item.pob / Math.max(item.n, 1) }));
  rows.sort((a, b) => (b.habPorPunto - a.habPorPunto) || (a.n - b.n) || (b.zone.pob - a.zone.pob));
  return { base: 'cobertura', zones: rows };
}
