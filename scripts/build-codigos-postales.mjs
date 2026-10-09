// Genera public/mapa/data/codigos-postales.json: codigo postal (4 digitos) + provincia -> ciudad.
//
//   node scripts/build-codigos-postales.mjs
//
// Entrada (no se publica): scripts/mapa-fuentes/geonames-AR.txt (GeoNames, CC-BY 4.0, www.geonames.org)
// Un codigo postal abarca varios barrios/localidades. Regla 1: si entre sus lugares figura el nombre de una ciudad
// del Censo en esa provincia, gana esa. Regla 2: si no, cada lugar vota por la ciudad mas cercana y el codigo entra
// solo si una reune MIN_VOTOS (70%). Sin mayoria clara el codigo no entra: es mejor sin ciudad que con una equivocada.
// Capital Federal no esta en la tabla: la ciudad es siempre "Ciudad de Buenos Aires" (ver codigo-postal.mjs).
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normClave, provinciaCanonica } from '../src/georef.mjs';
import { limpiarNombre } from '../public/mapa/nombres-ciudad.mjs';
import { haversineKm } from '../public/mapa/alcance.mjs';

export const MAX_LUGAR_KM = 25; // un lugar mas lejos que esto de toda ciudad no vota
export const MIN_VOTOS = 0.7; // la ciudad ganadora debe reunir al menos el 70% de los lugares del codigo
const raiz = fileURLToPath(new URL('..', import.meta.url));
// "MAR DEL PLATA SUCURSAL No.2" -> "MAR DEL PLATA"; "LA PLATA ESTAFETA No.6" -> "LA PLATA"
const claveLugar = (nombre) => normClave(nombre).replace(/ ?\(.*$/, '').replace(/ (SUCURSAL|ESTAFETA|CORREO|OFICINA)\b.*$/, '').trim();

export function construirTabla(textoGeonames, ciudades) {
  const candidatas = ciudades.filter((c) => c.lat != null && !/gobierno local/.test(c.nombre));
  const porClave = new Map();
  for (const linea of textoGeonames.split('\n')) {
    const col = linea.split('\t');
    if (col.length < 11) continue;
    const cp = col[1].trim();
    const prov = provinciaCanonica(col[3])?.cod;
    if (!/^\d{4}$/.test(cp) || !prov || prov === '02') continue;
    const clave = `${prov}|${cp}`;
    (porClave.get(clave) || porClave.set(clave, []).get(clave)).push([Number(col[9]), Number(col[10]), claveLugar(col[2])]);
  }
  const tabla = {};
  for (const [clave, puntos] of porClave) {
    // Cada lugar del codigo vota por la ciudad del Censo mas cercana (dentro de la provincia y de MAX_LUGAR_KM).
    // Un codigo entra a la tabla solo si una ciudad reune al menos MIN_VOTOS de los lugares.
    // 1) Si entre los lugares del codigo figura el nombre de una ciudad de la provincia, esa gana (la mas poblada si hay varias).
    const nombres = new Set(puntos.map((p) => p[2]));
    const porNombre = candidatas.filter((c) => c.prov === clave.slice(0, 2) && (nombres.has(normClave(limpiarNombre(c).nombre)) || nombres.has(normClave(c.nombre))));
    if (porNombre.length) {
      tabla[clave] = limpiarNombre(porNombre.sort((a, b) => b.pob - a.pob)[0]).nombre;
      continue;
    }
    // 2) Si no, votan los lugares.
    const votos = new Map();
    for (const [lat, lon] of puntos) {
      let mejor = null;
      for (const c of candidatas) {
        if (c.prov !== clave.slice(0, 2)) continue;
        const d = haversineKm(lat, lon, c.lat, c.lon);
        if (!mejor || d < mejor.d) mejor = { c, d };
      }
      if (mejor && mejor.d <= MAX_LUGAR_KM) votos.set(mejor.c, (votos.get(mejor.c) || 0) + 1);
    }
    const [ganadora, cantidad] = [...votos.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (ganadora && cantidad / puntos.length >= MIN_VOTOS) tabla[clave] = limpiarNombre(ganadora).nombre;
  }
  return tabla;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ciudades } = JSON.parse(readFileSync(`${raiz}public/mapa/data/ciudades.json`, 'utf8'));
  const tabla = construirTabla(readFileSync(`${raiz}scripts/mapa-fuentes/geonames-AR.txt`, 'utf8'), ciudades);
  const destino = `${raiz}public/mapa/data/codigos-postales.json`;
  writeFileSync(destino, JSON.stringify({
    fuente: 'GeoNames Postal Codes (AR), CC-BY 4.0, www.geonames.org; ciudad = la mas cercana del Censo 2022 al centro del codigo',
    min_votos: MIN_VOTOS,
    c: tabla,
  }));
  console.log(`${Object.keys(tabla).length} codigos con ciudad, ${(statSync(destino).size / 1024).toFixed(0)} KB`);
}
