// Alcance de los aplicadores sobre las ciudades (gobiernos locales, Censo 2022).
// Logica pura, sin DOM ni mapa: la usa app.js (via window.Alcance) y se testea en
// test/mapa-alcance.test.mjs. Distancia en LINEA RECTA (Haversine), no por ruta.
const RADIO_TIERRA_KM = 6371;
const rad = (grados) => (grados * Math.PI) / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Aplicador que cuenta para el alcance: tipo aplicador, ACTIVO (compro desde `corte`) y con
// ubicacion fiable. Los ubicados solo por provincia (pin aproximado) no cuentan.
export function esAplicadorQueCuenta(cliente, corte) {
  return cliente.tipo === 'aplicador'
    && Boolean(cliente.compro)
    && Boolean(cliente.ultima_compra) && cliente.ultima_compra >= corte
    && cliente.lat != null && cliente.lon != null
    && cliente.precision != null && cliente.precision !== 'provincia';
}

// ciudades: [{ id, nombre, prov, pob, lat, lon, aprox }] (lat/lon null = sin ubicar).
// aplicadores: [{ lat, lon }]. Devuelve cada ciudad con `n` (aplicadores que la alcanzan)
// y un resumen. Cada habitante se cuenta UNA sola vez, aunque lo alcancen varios aplicadores.
export function calcularAlcance(ciudades, aplicadores, radioKm) {
  const bandaGrados = radioKm / 111; // filtro rapido por latitud antes de medir
  const resultado = [];
  let pobTotal = 0;
  let pobSinUbicar = 0;
  let pobCubierta = 0;
  let ciudadesCubiertas = 0;
  let ciudadesUbicadas = 0;
  for (const ciudad of ciudades) {
    pobTotal += ciudad.pob || 0;
    if (ciudad.lat == null || ciudad.lon == null) {
      pobSinUbicar += ciudad.pob || 0;
      resultado.push({ ...ciudad, n: 0, ubicada: false });
      continue;
    }
    ciudadesUbicadas += 1;
    let n = 0;
    for (const a of aplicadores) {
      if (Math.abs(a.lat - ciudad.lat) > bandaGrados) continue;
      if (haversineKm(a.lat, a.lon, ciudad.lat, ciudad.lon) <= radioKm) n += 1;
    }
    if (n > 0) {
      pobCubierta += ciudad.pob || 0;
      ciudadesCubiertas += 1;
    }
    resultado.push({ ...ciudad, n, ubicada: true });
  }
  const pobUbicada = pobTotal - pobSinUbicar;
  return {
    ciudades: resultado,
    resumen: {
      radioKm,
      aplicadores: aplicadores.length,
      pobTotal,
      pobUbicada,
      pobSinUbicar,
      pobCubierta,
      pobSinCobertura: pobUbicada - pobCubierta,
      pctCubierta: pobUbicada > 0 ? (pobCubierta / pobUbicada) * 100 : 0,
      ciudadesUbicadas,
      ciudadesCubiertas,
    },
  };
}

// Ciudades ubicadas y sin ningun aplicador al alcance, de mayor a menor poblacion.
export function rankingSinCobertura(resultado, { minPob = 0, limite = 15 } = {}) {
  return resultado.ciudades
    .filter((c) => c.ubicada && c.n === 0 && (c.pob || 0) >= minPob)
    .sort((a, b) => b.pob - a.pob)
    .slice(0, limite);
}

export function claseAlcance(n) {
  return n === 0 ? 'sin' : n === 1 ? 'uno' : 'varios';
}

if (typeof window !== 'undefined') {
  window.Alcance = { haversineKm, esAplicadorQueCuenta, calcularAlcance, rankingSinCobertura, claseAlcance };
}
