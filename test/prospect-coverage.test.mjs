import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCityIndex, deficitRanking, familyPoints, locateCity } from '../src/prospect-coverage.mjs';
import { suggestZones } from '../src/prospect-plan.mjs';

const cities = JSON.parse(readFileSync(new URL('../public/mapa/data/ciudades.json', import.meta.url), 'utf8')).ciudades;
const provinces = Object.fromEntries(JSON.parse(readFileSync(new URL('../public/mapa/data/zonas.json', import.meta.url), 'utf8')).provincias.map((item) => [item.cod, item.nombre]));
const index = buildCityIndex(cities);

test('ubica una ciudad por nombre y desempata por provincia', () => {
  assert.equal(locateCity(index, 'cordoba', 'Córdoba', provinces).nombre, 'Córdoba');
  assert.equal(locateCity(index, 'Ciudad de Buenos Aires', '', provinces).prov, '02');
  assert.equal(locateCity(index, 'no existe esta ciudad'), null);
});

test('los puntos de una familia salen de sus prospectos y de los clientes del CRM, sin contar dos veces', () => {
  const prospects = [
    { id: 'p1', family: 'Penosil', lat: -31.4, lon: -64.2 },
    { id: 'p2', family: 'Penosil', city: 'Córdoba', province: 'Córdoba', linkedClientId: 'c1' },
    { id: 'p3', family: 'Resinplast', lat: -34.6, lon: -58.4 },
    { id: 'p4', family: 'Penosil', city: 'Lugar inexistente' },
  ];
  const clients = [
    { id: 'c1', family: 'Penosil', city: 'Córdoba', province: 'Córdoba' },
    { id: 'c2', family: 'PENOSIL', city: 'Paraná', province: 'Entre Ríos' },
    { id: 'c3', family: 'Baldes', city: 'Paraná', province: 'Entre Ríos' },
  ];
  const points = familyPoints('Penosil', { clients, prospects, cities, provinces });
  assert.deepEqual(points.map((item) => `${item.kind}:${item.id}`).sort(), ['cliente:c2', 'prospecto:p1', 'prospecto:p2']);
  assert.equal(points.find((item) => item.id === 'p1').located, 'exacto');
  assert.equal(points.find((item) => item.id === 'c2').located, 'ciudad');
});

test('sin datos de la familia se ordena por población', () => {
  const ranking = deficitRanking('Penosil', cities, []);
  assert.equal(ranking.base, 'población');
  assert.equal(ranking.zones[0].zone.nombre, 'Ciudad de Buenos Aires');
});

test('con datos, una gran ciudad con pocos puntos pasa antes que un pueblo sin ninguno', () => {
  // Un solo punto en Córdoba: Córdoba queda con 1 punto (1,5 M hab/punto) y un pueblo lejano con 0.
  const points = [{ lat: -31.4171, lon: -64.1832 }];
  const ranking = deficitRanking('Penosil', cities, points, { radiusKm: 50 });
  assert.equal(ranking.base, 'cobertura');
  const cordoba = ranking.zones.find((item) => item.zone.nombre === 'Córdoba');
  assert.equal(cordoba.n, 1);
  assert.ok(Math.round(cordoba.habPorPunto) > 1000000);
  const caba = ranking.zones.find((item) => item.zone.nombre === 'Ciudad de Buenos Aires');
  assert.equal(caba.n, 0);
  assert.ok(ranking.zones.indexOf(caba) < ranking.zones.indexOf(cordoba), 'CABA (3,1 M sin cobertura) antes que Córdoba (1,5 M con 1 punto)');
  const sorted = ranking.zones.map((item) => item.habPorPunto);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
});

test('el alcance de Baldes sigue limitado a CABA y Buenos Aires', () => {
  const ranking = deficitRanking('Baldes', cities, [{ lat: -34.6, lon: -58.4 }], { radiusKm: 50 });
  assert.ok(ranking.zones.every((item) => item.zone.prov === '02' || item.zone.prov === '06'));
});

test('las zonas sugeridas respetan el ranking por déficit y siguen salteando las agotadas', () => {
  const points = [{ lat: -34.6118, lon: -58.4173 }, { lat: -34.6, lon: -58.5 }];
  const ranking = deficitRanking('Penosil', cities, points, { radiusKm: 50 });
  const first = suggestZones('Penosil', cities, [], { count: 3, today: '2026-10-14', ranking });
  assert.deepEqual(first.map((item) => item.zone.id), ranking.zones.slice(0, 3).map((item) => item.zone.id));
  assert.ok(first.every((item) => typeof item.habPorPunto === 'number'));
  const log = [{ family: 'Penosil', zoneId: first[0].zone.id, date: '2026-10-14', found: 5, exhausted: true }];
  const next = suggestZones('Penosil', cities, log, { count: 3, today: '2026-10-15', ranking });
  assert.ok(!next.some((item) => item.zone.id === first[0].zone.id));
  assert.equal(next[0].zone.id, ranking.zones[1].zone.id);
});
