import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularAlcance, claseAlcance, esAplicadorQueCuenta, haversineKm, rankingSinCobertura } from '../public/mapa/alcance.mjs';

const MDP = { lat: -37.9657, lon: -57.743 };
const BAHIA = { lat: -38.5842, lon: -62.1694 };
const CABA = { lat: -34.6118, lon: -58.4173 };

test('haversineKm: distancias conocidas en linea recta', () => {
  assert.equal(haversineKm(MDP.lat, MDP.lon, MDP.lat, MDP.lon), 0);
  const mdpBahia = haversineKm(MDP.lat, MDP.lon, BAHIA.lat, BAHIA.lon);
  assert.ok(mdpBahia > 385 && mdpBahia < 400, `Mar del Plata - Bahia Blanca ~392 km, dio ${mdpBahia}`);
  const mdpCaba = haversineKm(MDP.lat, MDP.lon, CABA.lat, CABA.lon);
  assert.ok(mdpCaba > 372 && mdpCaba < 384, `Mar del Plata - CABA ~378 km en linea recta, dio ${mdpCaba}`);
});

test('esAplicadorQueCuenta: tipo aplicador, activo y con ubicacion fiable', () => {
  const base = { tipo: 'aplicador', compro: true, ultima_compra: '2026-09-01', lat: -38, lon: -57, precision: 'localidad' };
  assert.equal(esAplicadorQueCuenta(base, '2025-10-08'), true);
  assert.equal(esAplicadorQueCuenta({ ...base, tipo: 'inyeccion' }, '2025-10-08'), false);
  assert.equal(esAplicadorQueCuenta({ ...base, ultima_compra: '2024-01-01' }, '2025-10-08'), false); // inactivo
  assert.equal(esAplicadorQueCuenta({ ...base, compro: false }, '2025-10-08'), false);
  assert.equal(esAplicadorQueCuenta({ ...base, precision: 'provincia' }, '2025-10-08'), false); // pin aproximado
  assert.equal(esAplicadorQueCuenta({ ...base, lat: null }, '2025-10-08'), false);
  assert.equal(esAplicadorQueCuenta({ ...base, precision: 'departamento' }, '2025-10-08'), true);
});

const CIUDADES = [
  { id: '1', nombre: 'Mar del Plata', pob: 667082, ...MDP },
  { id: '2', nombre: 'Miramar', pob: 30000, lat: -38.27, lon: -57.84 }, // ~35 km de MDP
  { id: '3', nombre: 'Bahia Blanca', pob: 336557, ...BAHIA },
  { id: '4', nombre: 'Pueblo sin ubicar', pob: 5000, lat: null, lon: null },
];

test('calcularAlcance: cuenta aplicadores por ciudad y cada habitante una sola vez', () => {
  const aplicadores = [{ ...MDP }, { lat: -38.0, lon: -57.6 }]; // dos aplicadores en la zona de MDP
  const r = calcularAlcance(CIUDADES, aplicadores, 100);
  const porNombre = Object.fromEntries(r.ciudades.map((c) => [c.nombre, c.n]));
  assert.equal(porNombre['Mar del Plata'], 2);
  assert.equal(porNombre['Miramar'], 2);
  assert.equal(porNombre['Bahia Blanca'], 0);
  assert.equal(r.resumen.pobTotal, 667082 + 30000 + 336557 + 5000);
  assert.equal(r.resumen.pobSinUbicar, 5000);
  assert.equal(r.resumen.pobCubierta, 667082 + 30000); // no se duplica por tener 2 aplicadores
  assert.equal(r.resumen.pobSinCobertura, 336557);
  assert.equal(r.resumen.ciudadesCubiertas, 2);
  assert.equal(r.resumen.ciudadesUbicadas, 3);
  assert.ok(Math.abs(r.resumen.pctCubierta - (697082 / 1033639) * 100) < 1e-9);
});

test('calcularAlcance: el radio cambia la cobertura y sin aplicadores no hay cobertura', () => {
  const unAplicador = [{ ...MDP }];
  assert.equal(calcularAlcance(CIUDADES, unAplicador, 20).resumen.ciudadesCubiertas, 1); // Miramar queda afuera
  assert.equal(calcularAlcance(CIUDADES, unAplicador, 50).resumen.ciudadesCubiertas, 2);
  const nadie = calcularAlcance(CIUDADES, [], 100);
  assert.equal(nadie.resumen.pobCubierta, 0);
  assert.equal(nadie.resumen.pctCubierta, 0);
});

test('rankingSinCobertura: ordena por poblacion y deja afuera las cubiertas y las sin ubicar', () => {
  const r = calcularAlcance(CIUDADES, [{ ...MDP }], 100);
  const ranking = rankingSinCobertura(r);
  assert.deepEqual(ranking.map((c) => c.nombre), ['Bahia Blanca']);
  assert.equal(rankingSinCobertura(r, { minPob: 400000 }).length, 0);
  assert.equal(claseAlcance(0), 'sin');
  assert.equal(claseAlcance(1), 'uno');
  assert.equal(claseAlcance(3), 'varios');
});
