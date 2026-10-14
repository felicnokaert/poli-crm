// Lógica pura del mapa de Prospección (proyección, filtros y agrupación de pines).
// Es independiente del mapa de cobertura de POLIOCHO (public/mapa): comparten solo
// las funciones de cálculo (calcularAlcance), no los datos ni la pantalla.
import { PROSPECT_FAMILIES, familyConfig } from './prospect-model.mjs';

// Argentina continental. La proyección es equirrectangular corregida por la latitud media.
export const BOUNDS = { lonMin: -73.7, lonMax: -53.4, latMin: -55.3, latMax: -21.6 };
const SCALE = 20;
const COS_MID = Math.cos((38 * Math.PI) / 180);
export const MAP_SIZE = { width: (BOUNDS.lonMax - BOUNDS.lonMin) * COS_MID * SCALE, height: (BOUNDS.latMax - BOUNDS.latMin) * SCALE };

export function project(lat, lon) {
  return { x: (lon - BOUNDS.lonMin) * COS_MID * SCALE, y: (BOUNDS.latMax - lat) * SCALE };
}

// Contorno de las provincias (GeoJSON) como un solo `d` de SVG.
export function provincePaths(geojson) {
  const draw = (ring) => `${ring.map(([lon, lat], index) => { const { x, y } = project(lat, lon); return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('')}Z`;
  return (geojson?.features || []).map((feature) => {
    const { type, coordinates } = feature.geometry || {};
    const polygons = type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : [];
    return { id: feature.properties?.zid, d: polygons.map((polygon) => polygon.map(draw).join('')).join('') };
  });
}

// Unidad de negocio de cada familia (valores por defecto, a confirmar con Felipe).
export const FAMILY_UNITS = {
  Penosil: 'PENOSIL', Carrozados: 'POLIPLAST', 'Carrozados Imperpur': 'IMPERPUR', Planchas: 'FOAM FACTORY', Resinplast: 'RESINPLAST',
  PURMAC: 'PURMAC', Poliurea: 'PURMAC', Poliuretano: 'POLIPLAST', Baldes: 'POLIPLAST', Química: 'POLIPLAST', EPP: 'POLIPLAST',
  Pisos: 'POLIPLAST', Almohadas: 'POLIPLAST',
};
export const UNITS = [...new Set(Object.values(FAMILY_UNITS))].sort();
export const unitOfFamily = (family) => FAMILY_UNITS[family] || '';

export const STATE_COLORS = {
  'No contactado': '#7c8794', Contactado: '#2b6cb0', 'Con interés': '#2f855a', 'Sin interés': '#c53030', Cliente: '#1a202c',
};

// Puntos del mapa de ventas (todo lo que NO es aplicador): clientes del CRM que no
// son aplicadores y, si se pide, prospectos. Los aplicadores/RAPYP viven en su propio
// mapa y acá nunca aparecen. Los que no se pueden ubicar se cuentan aparte.
const isoFromCrm = (text) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || '').trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};

export function mapPoints({ prospects = [], clients = [], includeClients = false, includeProspects = true, isApplicator = () => false, locate }) {
  const points = [];
  let unlocated = 0;
  let applicators = 0;
  if (includeProspects) {
    for (const prospect of prospects) {
      const position = locate(prospect);
      if (!position) { unlocated += 1; continue; }
      points.push({ id: prospect.id, kind: 'prospecto', name: prospect.company, state: prospect.state, family: prospect.family, unit: unitOfFamily(prospect.family), city: prospect.city || '', province: prospect.province || '', date: String(prospect.createdAt || '').slice(0, 10), linkedClientId: prospect.linkedClientId || '', ...position });
    }
  }
  if (includeClients) {
    const linked = new Set(prospects.map((item) => item.linkedClientId).filter(Boolean));
    const crmToProspect = new Map(PROSPECT_FAMILIES.map((item) => [item.crmFamily.toLocaleLowerCase('es-AR'), item.key]));
    for (const client of clients) {
      if (isApplicator(client)) { applicators += 1; continue; }
      if (includeProspects && linked.has(client.id)) continue;
      const rawFamily = String(client.family || '').trim();
      const family = crmToProspect.get(rawFamily.toLocaleLowerCase('es-AR')) || rawFamily || 'Sin definir';
      const position = locate(client);
      if (!position) { unlocated += 1; continue; }
      points.push({ id: client.id, kind: 'cliente', name: client.company, state: 'Cliente', family, unit: unitOfFamily(family), city: client.city || '', province: client.province || '', date: isoFromCrm(client.lastPurchase), linkedClientId: client.id, ...position });
    }
  }
  return { points, unlocated, applicators };
}

export function filterPoints(points, { unit = '', family = '', state = '', province = '', city = '', from = '', to = '' } = {}) {
  const cityText = city.trim().toLocaleLowerCase('es-AR');
  return points.filter((point) => (!unit || point.unit === unit)
    && (!family || point.family === family)
    && (!state || point.state === state)
    && (!province || point.province === province)
    && (!cityText || point.city.toLocaleLowerCase('es-AR').includes(cityText))
    && (!from || !point.date || point.date >= from)
    && (!to || !point.date || point.date <= to));
}

// Agrupa los pines en una grilla cuyo tamaño de celda depende del zoom: cerca se ven sueltos.
export function clusterPoints(points, cellSize) {
  const cells = new Map();
  for (const point of points) {
    const { x, y } = project(point.lat, point.lon);
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const cell = cells.get(key) || { x: 0, y: 0, items: [] };
    cell.x += x;
    cell.y += y;
    cell.items.push(point);
    cells.set(key, cell);
  }
  return [...cells.values()].map((cell) => {
    const counts = {};
    for (const item of cell.items) counts[item.state] = (counts[item.state] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { x: cell.x / cell.items.length, y: cell.y / cell.items.length, items: cell.items, count: cell.items.length, state: dominant };
  });
}

export function familiesForUnit(unit) {
  return PROSPECT_FAMILIES.filter((item) => !unit || unitOfFamily(item.key) === unit).map((item) => item.key).filter((key) => familyConfig(key));
}

// "Dónde vendo": cuántos clientes y prospectos hay por provincia (ordenado de más a menos).
export function salesByProvince(points = []) {
  const rows = new Map();
  for (const point of points) {
    const key = point.province || 'Sin provincia';
    const row = rows.get(key) || { province: key, clients: 0, prospects: 0 };
    if (point.kind === 'cliente') row.clients += 1; else row.prospects += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (b.clients + b.prospects) - (a.clients + a.prospects) || a.province.localeCompare(b.province, 'es'));
}
