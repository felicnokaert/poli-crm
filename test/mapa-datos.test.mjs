import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { linkWhatsApp, soloDigitos } from '../public/mapa/contacto.mjs';

const ruta = (p) => new URL(`../public/mapa/${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(ruta(p), 'utf8'));
const puntos = (geometria) => { let n = 0; (function r(a) { typeof a[0] === 'number' ? (n += 1) : a.forEach(r); })(geometria.coordinates); return n; };

// ---- Presupuesto de velocidad (docs/DESIGN_MAPA.md §7.2): si alguien vuelve a poner los límites
// completos del IGN (2,7 MB y 137.000 puntos c/u) en public/, estos tests lo frenan. ----
test('límites livianos: tamaño y cantidad de puntos dentro del presupuesto', () => {
  const prov = json('data/provincias.geojson');
  const dep = json('data/departamentos.geojson');
  assert.ok(statSync(ruta('data/provincias.geojson')).size <= 400 * 1024, 'provincias.geojson pesa más de 400 KB');
  assert.ok(statSync(ruta('data/departamentos.geojson')).size <= 700 * 1024, 'departamentos.geojson pesa más de 700 KB');
  assert.ok(prov.features.reduce((s, f) => s + puntos(f.geometry), 0) <= 20000, 'provincias tiene demasiados puntos');
  assert.ok(dep.features.reduce((s, f) => s + puntos(f.geometry), 0) <= 30000, 'departamentos tiene demasiados puntos');
});

test('límites: solo el identificador de zona (zid), único, y cubren todas las zonas de zonas.json', () => {
  const zonas = json('data/zonas.json');
  for (const [archivo, ids] of [['data/provincias.geojson', zonas.provincias.map((z) => z.cod)], ['data/departamentos.geojson', zonas.departamentos.map((z) => z.id)]]) {
    const geo = json(archivo);
    const zids = geo.features.map((f) => f.properties.zid);
    assert.equal(new Set(zids).size, zids.length, `${archivo}: zid repetido`);
    for (const f of geo.features) assert.deepEqual(Object.keys(f.properties), ['zid'], `${archivo}: propiedades de más`);
    for (const id of ids) assert.ok(zids.includes(id), `${archivo}: falta la zona ${id}`);
  }
});

test('etiquetas: 24 provincias y 513 departamentos visibles (sin Antártida), dentro del mapa', () => {
  const e = json('data/etiquetas.json');
  assert.equal(e.p.length, 24);
  assert.equal(e.d.length, 513); // el departamento Antártida Argentina queda fuera de la vista del mapa
  for (const [nombre, lon, lat] of [...e.p, ...e.d]) {
    assert.ok(nombre && lon > -75 && lon < -53 && lat > -56 && lat < -21, `etiqueta fuera de rango: ${nombre}`);
  }
  assert.ok(statSync(ruta('data/etiquetas.json')).size <= 60 * 1024);
});

test('ciudades: 2.277 gobiernos locales con población total del Censo 2022', () => {
  const { ciudades } = json('data/ciudades.json');
  assert.equal(ciudades.length, 2277);
  assert.equal(ciudades.reduce((s, c) => s + c.pob, 0), 45892285);
});

// ---- Guardas de la política de seguridad del CRM (script-src 'self', sin eval ni CDNs) ----
test('el mapa no carga nada de afuera ni librerías que usan eval (turf rompió Alcance en producción)', () => {
  const html = readFileSync(ruta('index.html'), 'utf8');
  const app = readFileSync(ruta('app.js'), 'utf8');
  assert.equal(/<script[^>]+src="https?:/.test(html), false, 'script externo en index.html');
  assert.equal(/<link[^>]+href="https?:/.test(html), false, 'hoja de estilos externa en index.html');
  assert.equal(/turf/i.test(html), false, 'index.html vuelve a cargar turf');
  assert.equal(/\bturf\./.test(app), false, 'app.js usa turf');
  assert.equal(/https?:\/\/(unpkg|cdn|demotiles)/.test(app), false, 'app.js apunta a un CDN');
  for (const lib of ['vendor/maplibre-gl-csp.js', 'vendor/maplibre-gl-csp-worker.js', 'vendor/xlsx.full.min.js']) {
    assert.equal(/new Function\(/.test(readFileSync(ruta(lib), 'utf8')), false, `${lib} usa new Function (bloqueado por la CSP)`);
  }
});

test('el arranque no carga xlsx ni turf (se cargan a pedido)', () => {
  const html = readFileSync(ruta('index.html'), 'utf8');
  assert.equal(/xlsx/.test(html), false);
  assert.match(readFileSync(ruta('app.js'), 'utf8'), /cargarScript\("vendor\/xlsx\.full\.min\.js"\)/);
});

test('los colores del mapa salen de variables CSS: sin hex sueltos en app.js', () => {
  const app = readFileSync(ruta('app.js'), 'utf8');
  const sinComentarios = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.deepEqual(sinComentarios.match(/["'`]#[0-9a-fA-F]{3,8}["'`]/g) || [], []);
});

test('las fuentes de las etiquetas existen localmente (Regular y Bold, rango 0-255)', () => {
  for (const f of ['Noto Sans Regular', 'Noto Sans Bold']) assert.ok(statSync(ruta(`fonts/${f}/0-255.pbf`)).size > 10000);
  assert.ok(statSync(ruta('fonts/dm-sans-latin-wght-normal.woff2')).size > 10000);
});

// ---- Contacto a mano (solo vista del CRM) ----
test('linkWhatsApp: arma el número de celular argentino en sus formatos habituales', () => {
  assert.equal(linkWhatsApp('1155551234'), 'https://wa.me/5491155551234');
  assert.equal(linkWhatsApp('011 5555-1234'), 'https://wa.me/5491155551234');
  assert.equal(linkWhatsApp('+54 9 11 5555-1234'), 'https://wa.me/5491155551234');
  assert.equal(linkWhatsApp('5491155551234'), 'https://wa.me/5491155551234');
  assert.equal(linkWhatsApp('541155551234'), 'https://wa.me/5491155551234');
  assert.equal(linkWhatsApp('2236 15 553212'.replace(/\s/g, '')), 'https://wa.me/5492236553212'); // área + 15 + número
});

test('linkWhatsApp: devuelve null si no parece un teléfono completo', () => {
  assert.equal(linkWhatsApp(''), null);
  assert.equal(linkWhatsApp('12345'), null);
  assert.equal(linkWhatsApp(undefined), null);
  assert.equal(soloDigitos('(011) 5555-1234'), '01155551234');
});
