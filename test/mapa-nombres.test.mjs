import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NOMBRE_DE_CIUDAD, limpiarNombre, nombresAmigables } from '../public/mapa/nombres-ciudad.mjs';

const leer = (p) => JSON.parse(readFileSync(new URL(`../public/mapa/data/${p}`, import.meta.url), 'utf8'));
const { ciudades } = leer('ciudades.json');
const zonas = leer('zonas.json');
const nombreProv = (cod) => zonas.provincias.find((z) => z.cod === cod)?.nombre || '';
const amigables = nombresAmigables(ciudades, nombreProv);
const porId = new Map(amigables.map((c) => [c.id, c]));

test('los municipios conocidos se muestran con el nombre de la ciudad y conservan el del Censo', () => {
  assert.equal(porId.get('060357').nombre, 'Mar del Plata');
  assert.equal(porId.get('060357').muni, 'General Pueyrredón');
  assert.equal(porId.get('060182').nombre, 'Punta Alta');
  assert.equal(porId.get('060648').nombre, 'Guernica');
  for (const id of Object.keys(NOMBRE_DE_CIUDAD)) assert.ok(porId.has(id), `el alias ${id} no existe en ciudades.json`);
});

test('ninguna etiqueta muestra los códigos técnicos del Censo', () => {
  for (const c of amigables) {
    assert.equal(/gobierno local|\(\d{5,6}\)/.test(c.nombre), false, `etiqueta técnica: ${c.nombre}`);
  }
});

test('zonas rurales: se marcan y se llaman "(zona rural)"', () => {
  assert.deepEqual(limpiarNombre({ id: 'x', nombre: 'Copo (gobierno local 860056)' }), { nombre: 'Copo', rural: true });
  assert.deepEqual(limpiarNombre({ id: 'x', nombre: 'Córdoba: zona sin gobierno local (140000)' }), { nombre: 'Córdoba', rural: true });
  assert.deepEqual(limpiarNombre({ id: 'x', nombre: 'Rosario' }), { nombre: 'Rosario', rural: false });
  const rurales = amigables.filter((c) => c.rural);
  assert.equal(rurales.length, 246);
  assert.ok(rurales.every((c) => /\(zona rural/.test(c.nombre)));
  assert.ok(!amigables.filter((c) => !c.rural).some((c) => /zona rural/.test(c.nombre)));
});

test('nombres repetidos en el país: llevan la provincia; los únicos quedan tal cual', () => {
  const sanMartin = amigables.filter((c) => c.muni === 'General San Martín');
  assert.equal(sanMartin.length, 4);
  assert.ok(sanMartin.every((c) => /\(.+\)$/.test(c.nombre)), 'General San Martín debería llevar provincia');
  assert.equal(porId.get('060371').nombre, 'General San Martín (Buenos Aires)');
  assert.equal(porId.get('820210').nombre, 'Rosario'); // único: sin agregados
});

test('no se pierde ni cambia ninguna ciudad: misma cantidad, población, ubicación e id', () => {
  assert.equal(amigables.length, 2277);
  assert.equal(amigables.reduce((s, c) => s + c.pob, 0), 45892285);
  for (const [i, c] of amigables.entries()) {
    assert.equal(c.id, ciudades[i].id);
    assert.equal(c.lat, ciudades[i].lat);
    assert.equal(c.lon, ciudades[i].lon);
  }
});

test('las ciudades de 30.000 habitantes o más que se dibujan tienen rótulo único en todo el país', () => {
  // Los homónimos que quedan son localidades chicas en lugares distintos (ambigüedad del propio Censo)
  // o zonas rurales sin coordenadas, que no se dibujan.
  const vistos = new Map();
  for (const c of amigables.filter((x) => x.lat != null && x.pob >= 30000)) {
    assert.ok(!vistos.has(c.nombre), `rótulo repetido entre ciudades grandes: ${c.nombre}`);
    vistos.set(c.nombre, c.id);
  }
});

test('el mapa usa los nombres amigables y las zonas rurales se rotulan solo con zoom profundo', () => {
  const app = readFileSync(new URL('../public/mapa/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/mapa/index.html', import.meta.url), 'utf8');
  assert.match(html, /nombres-ciudad\.mjs/);
  assert.match(app, /nombresAmigables\(/);
  assert.match(app, /pobEt: c\.rural \? 0 : c\.pob/);
  assert.match(app, /\["get", "pobEt"\], min/);
});
