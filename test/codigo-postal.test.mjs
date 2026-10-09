import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { CIUDAD_CABA, ciudadPorCodigoPostal, codigoDeCuatro } from '../src/codigo-postal.mjs';
import { planearCiudadesPorCodigoPostal, planearUbicaciones } from '../src/client-location.mjs';

const ruta = new URL('../public/mapa/data/codigos-postales.json', import.meta.url);
const tabla = JSON.parse(readFileSync(ruta, 'utf8'));
const cliente = (extra) => ({ id: `c-${extra.cuit}`, legalName: 'Cliente', ...extra });

test('codigoDeCuatro: acepta 4 dígitos y el formato CPA, rechaza lo demás', () => {
  assert.equal(codigoDeCuatro('7600'), '7600');
  assert.equal(codigoDeCuatro(' 7600 '), '7600');
  assert.equal(codigoDeCuatro('B7600FWB'), '7600');
  for (const malo of ['', null, undefined, '760', '76000', 'abcd', '7600 Mar del Plata']) assert.equal(codigoDeCuatro(malo), null);
});

test('ciudadPorCodigoPostal: Capital Federal siempre; el resto, solo si el código está en la tabla', () => {
  assert.equal(ciudadPorCodigoPostal(tabla, 'Capital Federal', '1429'), CIUDAD_CABA);
  assert.equal(ciudadPorCodigoPostal(tabla, 'Ciudad de Buenos Aires', 'C1429ABC'), CIUDAD_CABA);
  assert.equal(ciudadPorCodigoPostal(tabla, 'Buenos Aires', '7600'), 'Mar del Plata');
  assert.equal(ciudadPorCodigoPostal(tabla, 'Buenos Aires', '1900'), 'La Plata');
  assert.equal(ciudadPorCodigoPostal(tabla, 'Rio Negro', '8400'), 'San Carlos de Bariloche');
  assert.equal(ciudadPorCodigoPostal(tabla, 'Mendoza', '5519'), null); // ambiguo: no se adivina
  assert.equal(ciudadPorCodigoPostal(tabla, 'Narnia', '7600'), null);
  assert.equal(ciudadPorCodigoPostal(tabla, 'Buenos Aires', 'sin cp'), null);
  assert.equal(ciudadPorCodigoPostal(null, 'Buenos Aires', '7600'), null);
});

test('tabla: tamaño acotado, claves "provincia|código", sin Capital Federal y con atribución', () => {
  assert.ok(statSync(ruta).size <= 80 * 1024, 'la tabla pesa más de 80 KB');
  const claves = Object.keys(tabla.c);
  assert.ok(claves.length > 1000);
  assert.ok(claves.every((k) => /^\d{2}\|\d{4}$/.test(k)));
  assert.ok(!claves.some((k) => k.startsWith('02|')));
  assert.ok(Object.values(tabla.c).every((nombre) => nombre && !/gobierno local/.test(nombre)));
  assert.match(tabla.fuente, /GeoNames/);
});

test('plan con planilla: completa la ciudad por código postal cuando la planilla no la sabe ("SIN IDENTIFICAR")', () => {
  const clients = [cliente({ cuit: '30-22222222-2' }), cliente({ cuit: '30-33333333-3' }), cliente({ cuit: '30-44444444-4' })];
  const plan = planearUbicaciones(clients, [
    { doc: '30222222222', province: 'Buenos Aires', city: 'SIN IDENTIFICAR', postalCode: '7600', address: 'Salta 1056' },
    { doc: '30333333333', province: 'Capital Federal', city: 'SIN IDENTIFICAR', postalCode: '1429' },
    { doc: '30444444444', province: 'Mendoza', city: 'SIN IDENTIFICAR', postalCode: '5519' }, // ambiguo
  ], { tablaCP: tabla });
  assert.equal(plan.cambios.find((c) => c.doc === '30222222222').nuevo.city, 'Mar del Plata');
  assert.equal(plan.cambios.find((c) => c.doc === '30333333333').nuevo.city, CIUDAD_CABA);
  assert.equal(plan.cambios.find((c) => c.doc === '30444444444').nuevo.city, undefined);
  assert.equal(plan.porCodigoPostal, 2);
});

test('plan: una ciudad que la planilla sí trae gana sobre el código postal, y la ya cargada nunca se pisa', () => {
  const clients = [cliente({ cuit: '30-22222222-2' }), cliente({ cuit: '30-33333333-3', province: 'Buenos Aires', city: 'Miramar', postalCode: '7600' })];
  const plan = planearUbicaciones(clients, [
    { doc: '30222222222', province: 'Buenos Aires', city: 'Tandil', postalCode: '7600' },
    { doc: '30333333333', province: 'Buenos Aires', city: 'Necochea', postalCode: '7600' },
  ], { tablaCP: tabla });
  assert.equal(plan.cambios.find((c) => c.doc === '30222222222').nuevo.city, 'Tandil');
  assert.equal(plan.cambios.find((c) => c.doc === '30222222222').viaCP, false);
  assert.equal(plan.cambios.find((c) => c.doc === '30333333333'), undefined); // ya tenía "Miramar"
});

test('plan solo con lo ya cargado en los clientes (botón "completar por código postal")', () => {
  const clients = [
    cliente({ cuit: '30-22222222-2', province: 'Buenos Aires', postalCode: '1900' }),
    cliente({ cuit: '30-33333333-3', province: 'Buenos Aires', city: 'Quilmes', postalCode: '1900' }),
    cliente({ cuit: '30-44444444-4', province: 'Buenos Aires' }), // sin código postal: nada que hacer
  ];
  const plan = planearCiudadesPorCodigoPostal(clients, tabla);
  assert.deepEqual(plan.cambios.map((c) => [c.doc, c.nuevo]), [['30222222222', { city: 'La Plata' }]]);
  assert.equal(plan.porCodigoPostal, 1);
});
