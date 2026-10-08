// Genera los archivos LIVIANOS del mapa de cobertura a partir de los limites completos del IGN.
//
//   node scripts/build-mapa-data.mjs
//
// Entrada (no se publica):  scripts/mapa-fuentes/provincias.geojson, departamentos.geojson (137.000 puntos c/u)
// Salida (se publica):      public/mapa/data/provincias.geojson, departamentos.geojson, etiquetas.json
//
// La simplificacion respeta las fronteras compartidas entre vecinos (mapshaper, keep-shapes), asi no
// quedan huecos entre provincias/departamentos. Se mide en docs/DESIGN_MAPA.md (seccion 7.2).
// Requiere mapshaper: se usa `npx mapshaper@0.6.100` o la ruta de la variable MAPSHAPER_BIN.
// Solo se usa turf aca (para ubicar la etiqueta DENTRO de cada poligono); el sitio ya no lo carga.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const turf = require('./herramientas/turf.min.cjs');
const raiz = fileURLToPath(new URL('..', import.meta.url));
const fuentes = join(raiz, 'scripts', 'mapa-fuentes');
const destino = join(raiz, 'public', 'mapa', 'data');

export const AJUSTES = {
  provincias: { porcentaje: 8, clave: 'in1' },
  departamentos: { porcentaje: 12, clave: 'id' },
};

function simplificar(nombre, porcentaje, carpeta) {
  const salida = join(carpeta, `${nombre}.json`);
  const bin = process.env.MAPSHAPER_BIN;
  const args = [join(fuentes, `${nombre}.geojson`), '-simplify', `${porcentaje}%`, 'keep-shapes', '-o', salida, 'format=geojson', 'precision=0.0001'];
  if (bin) execFileSync(bin, args, { stdio: 'inherit', shell: true });
  else execFileSync('npx', ['-y', 'mapshaper@0.6.100', ...args], { stdio: 'inherit', shell: true });
  return JSON.parse(readFileSync(salida, 'utf8'));
}

const LIMITES = [-74, -56, -53, -21.5]; // lo mismo que muestra el mapa al abrir (PAIS en app.js)

// La etiqueta va DENTRO del polígono más grande que se ve en el mapa: Tierra del Fuego incluye la Antártida y
// las islas del Atlántico Sur, y un "punto interior" cualquiera caería fuera de la vista.
function puntoDeEtiqueta(feature) {
  const g = feature.geometry;
  const poligonos = g.type === 'MultiPolygon' ? g.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates })) : [g];
  const visibles = poligonos.filter((p) => {
    const [lon, lat] = turf.centroid({ type: 'Feature', properties: {}, geometry: p }).geometry.coordinates;
    return lon >= LIMITES[0] && lon <= LIMITES[2] && lat >= LIMITES[1] && lat <= LIMITES[3];
  });
  const candidatos = visibles.length ? visibles : poligonos;
  const mayor = candidatos.reduce((a, b) => (turf.area({ type: 'Feature', properties: {}, geometry: b }) > turf.area({ type: 'Feature', properties: {}, geometry: a }) ? b : a));
  return turf.pointOnFeature({ type: 'Feature', properties: {}, geometry: mayor }).geometry.coordinates;
}

const compacto = (coleccion) => JSON.stringify(coleccion);
const kb = (ruta) => `${(statSync(ruta).size / 1024).toFixed(0)} KB`;

const carpeta = mkdtempSync(join(tmpdir(), 'mapa-datos-'));
try {
  const zonas = JSON.parse(readFileSync(join(destino, 'zonas.json'), 'utf8'));
  const nombreProvincia = new Map(zonas.provincias.map((z) => [z.cod, z.nombre]));
  const nombreDepartamento = new Map(zonas.departamentos.map((z) => [z.id, z.nombre]));
  const etiquetas = { p: [], d: [] };

  for (const [nombre, { porcentaje, clave }] of Object.entries(AJUSTES)) {
    const geo = simplificar(nombre, porcentaje, carpeta);
    const features = geo.features.map((f) => ({
      type: 'Feature',
      properties: { zid: String(f.properties[clave]) }, // solo el identificador: todo lo demas se calcula aparte
      geometry: f.geometry,
    }));
    for (const f of features) {
      const nombreZona = (nombre === 'provincias' ? nombreProvincia : nombreDepartamento).get(f.properties.zid);
      if (!nombreZona) continue; // zonas sin poblacion/nombre en zonas.json no llevan etiqueta
      const [lon, lat] = puntoDeEtiqueta(f);
      if (lon < LIMITES[0] || lon > LIMITES[2] || lat < LIMITES[1] || lat > LIMITES[3]) continue; // fuera del mapa (ej. Antártida)
      const punto = [nombreZona, Number(lon.toFixed(4)), Number(lat.toFixed(4))];
      if (nombre === 'provincias') etiquetas.p.push(punto);
      else etiquetas.d.push([...punto, f.properties.zid.slice(0, 2)]);
    }
    const ruta = join(destino, `${nombre}.geojson`);
    writeFileSync(ruta, compacto({ type: 'FeatureCollection', features }));
    console.log(`${nombre}: ${features.length} zonas, ${kb(ruta)} (antes ${kb(join(fuentes, `${nombre}.geojson`))})`);
  }
  const rutaEtiquetas = join(destino, 'etiquetas.json');
  writeFileSync(rutaEtiquetas, JSON.stringify(etiquetas));
  console.log(`etiquetas: ${etiquetas.p.length} provincias + ${etiquetas.d.length} departamentos, ${kb(rutaEtiquetas)}`);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
