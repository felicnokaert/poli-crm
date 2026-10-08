// Ubicación de clientes con la API Georef (datos.gob.ar): localidad -> departamento
// + coordenadas. Port de mapa-cobertura/etl/geocode.py (niveles localidad,
// departamento y provincia; el nivel "dirección" queda para cuando el CRM tenga
// domicilio cargado). Puro e inyectable: `fetchImpl` y `cache` se pasan desde
// afuera, así se testea sin red y el navegador decide dónde guarda el cache.
const API = 'https://apis.datos.gob.ar/georef/api/';
const LOTE = 100;

export const PROVINCIAS = {
  '02': 'Ciudad de Buenos Aires', '06': 'Buenos Aires', '10': 'Catamarca', '14': 'Córdoba',
  '18': 'Corrientes', '22': 'Chaco', '26': 'Chubut', '30': 'Entre Ríos', '34': 'Formosa',
  '38': 'Jujuy', '42': 'La Pampa', '46': 'La Rioja', '50': 'Mendoza', '54': 'Misiones',
  '58': 'Neuquén', '62': 'Río Negro', '66': 'Salta', '70': 'San Juan', '74': 'San Luis',
  '78': 'Santa Cruz', '82': 'Santa Fe', '86': 'Santiago del Estero', '90': 'Tucumán',
  '94': 'Tierra del Fuego',
};

export const SIN_LOCALIDAD = new Set(['', 'SIN IDENTIFICAR', 'S/D', '-', 'NO INFORMADO']);

export function normClave(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

const PROV_POR_CLAVE = new Map(Object.entries(PROVINCIAS).map(([cod, nombre]) => [normClave(nombre), { cod, nombre }]));
PROV_POR_CLAVE.set('CAPITAL FEDERAL', { cod: '02', nombre: PROVINCIAS['02'] });
PROV_POR_CLAVE.set('CABA', { cod: '02', nombre: PROVINCIAS['02'] });
// Variantes que traen los sistemas de facturación y las planillas (Contabilium, Excel propio).
for (const variante of ['C.A.B.A.', 'CIUDAD AUTONOMA DE BUENOS AIRES', 'CAP. FEDERAL', 'CAPITAL']) PROV_POR_CLAVE.set(normClave(variante), { cod: '02', nombre: PROVINCIAS['02'] });
for (const variante of ['BS AS', 'BS. AS.', 'BS.AS.', 'PROVINCIA DE BUENOS AIRES', 'PCIA DE BUENOS AIRES', 'PCIA. DE BUENOS AIRES']) PROV_POR_CLAVE.set(normClave(variante), { cod: '06', nombre: PROVINCIAS['06'] });
PROV_POR_CLAVE.set('TIERRA DEL FUEGO ANTARTIDA E ISLAS DEL ATLANTICO SUR', { cod: '94', nombre: PROVINCIAS['94'] });

export function provinciaCanonica(texto) {
  return PROV_POR_CLAVE.get(normClave(texto)) || null;
}

// CABA se trata como una sola zona (02000), igual que el mapa.
export function deptoZona(deptoId) {
  return deptoId && String(deptoId).startsWith('02') ? '02000' : deptoId;
}

async function post(fetchImpl, endpoint, clave, consultas) {
  const response = await fetchImpl(API + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [clave]: consultas }),
  });
  if (!response.ok) throw new Error(`Georef ${endpoint} respondió ${response.status}`);
  return (await response.json()).resultados;
}

function centroide(objeto = {}) {
  const c = objeto.centroide || objeto.ubicacion || {};
  return [c.lat, c.lon];
}

// pendientes: [{ prov, clave, nombre }]. Guarda en cache.localidades["PROV|CLAVE"]
// { nivel, deptoId, lat, lon } o null si Georef no la conoce.
export async function resolverLocalidades(pendientes, { fetchImpl = fetch, cache }) {
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE);
    const resultados = await post(fetchImpl, 'localidades', 'localidades',
      lote.map((p) => ({ nombre: p.nombre, provincia: p.prov, max: 10, campos: 'id,nombre,centroide,departamento' })));
    lote.forEach((p, index) => {
      const candidatas = resultados[index]?.localidades || [];
      const exactas = candidatas.filter((c) => normClave(c.nombre) === normClave(p.nombre));
      const elegida = (exactas.length ? exactas : candidatas)[0];
      const [lat, lon] = elegida ? centroide(elegida) : [null, null];
      cache.localidades[`${p.prov}|${p.clave}`] = elegida && lat != null
        ? { nivel: 'localidad', deptoId: deptoZona(elegida.departamento?.id), lat, lon }
        : null;
    });
  }
  // Lo que no es una localidad conocida puede ser el nombre de un departamento (ej. "Concordia").
  const sin = pendientes.filter((p) => !cache.localidades[`${p.prov}|${p.clave}`]);
  for (let i = 0; i < sin.length; i += LOTE) {
    const lote = sin.slice(i, i + LOTE);
    const resultados = await post(fetchImpl, 'departamentos', 'departamentos',
      lote.map((p) => ({ nombre: p.nombre, provincia: p.prov, max: 5, campos: 'id,nombre,centroide' })));
    lote.forEach((p, index) => {
      const exacto = (resultados[index]?.departamentos || []).find((d) => normClave(d.nombre) === normClave(p.nombre));
      const [lat, lon] = exacto ? centroide(exacto) : [null, null];
      if (exacto && lat != null) {
        cache.localidades[`${p.prov}|${p.clave}`] = { nivel: 'departamento', deptoId: deptoZona(exacto.id), lat, lon };
      }
    });
  }
}

export async function centroidesProvincias({ fetchImpl = fetch, cache }) {
  if (!Object.keys(cache.provincias).length) {
    const response = await fetchImpl(`${API}provincias?campos=id,centroide&max=30`);
    if (!response.ok) throw new Error(`Georef provincias respondió ${response.status}`);
    for (const p of (await response.json()).provincias) cache.provincias[p.id] = { lat: p.centroide.lat, lon: p.centroide.lon };
  }
  return cache.provincias;
}

// Desplazamiento determinista (por documento) para que los clientes ubicados solo
// por provincia no se apilen en el mismo punto.
export function jitter(doc, radioGrados = 0.3) {
  let h = 2166136261;
  for (const ch of String(doc)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const ang = ((h % 3600) / 3600) * 2 * Math.PI;
  const rad = radioGrados * Math.sqrt(0.25 + 0.75 * (((h >>> 8) % 1000) / 1000));
  return [rad * Math.sin(ang), rad * Math.cos(ang)];
}

export function nuevoCache() {
  return { localidades: {}, provincias: {} };
}

// clientes: [{ doc, provincia_cod, localidad }]. Devuelve Map(doc -> {lat, lon,
// depto_id, precision, motivo_aprox}). precision: localidad | departamento | provincia | null.
export async function ubicarClientes(clientes, { fetchImpl = fetch, cache = nuevoCache() } = {}) {
  const pendientes = new Map();
  for (const c of clientes) {
    const clave = normClave(c.localidad);
    if (!c.provincia_cod || SIN_LOCALIDAD.has(clave)) continue;
    const llave = `${c.provincia_cod}|${clave}`;
    if (!(llave in cache.localidades) || cache.localidades[llave] === undefined) {
      pendientes.set(llave, { prov: c.provincia_cod, clave, nombre: c.localidad });
    }
  }
  if (pendientes.size) await resolverLocalidades([...pendientes.values()], { fetchImpl, cache });

  const provincias = clientes.some((c) => c.provincia_cod) ? await centroidesProvincias({ fetchImpl, cache }) : {};
  const resultado = new Map();
  for (const c of clientes) {
    const clave = normClave(c.localidad);
    const loc = c.provincia_cod ? cache.localidades[`${c.provincia_cod}|${clave}`] : null;
    if (loc) {
      resultado.set(c.doc, { lat: loc.lat, lon: loc.lon, depto_id: loc.deptoId, precision: loc.nivel, motivo_aprox: null });
      continue;
    }
    const centro = c.provincia_cod ? provincias[c.provincia_cod] : null;
    if (centro) {
      const [dx, dy] = jitter(c.doc);
      resultado.set(c.doc, {
        lat: centro.lat + dx, lon: centro.lon + dy, depto_id: null, precision: 'provincia',
        motivo_aprox: SIN_LOCALIDAD.has(clave) ? 'sin_localidad' : 'localidad_no_encontrada',
      });
    } else {
      resultado.set(c.doc, { lat: null, lon: null, depto_id: null, precision: null, motivo_aprox: 'sin_provincia' });
    }
  }
  return resultado;
}
