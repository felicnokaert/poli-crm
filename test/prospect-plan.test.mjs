import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { familyForDate, rotationFamilies, suggestZones, zoneStatus, zonesForFamily, scopeDescription } from '../src/prospect-plan.mjs';

const cities = JSON.parse(readFileSync(new URL('../public/mapa/data/ciudades.json', import.meta.url), 'utf8')).ciudades;
const byName = (name) => cities.find((item) => item.nombre === name);

test('rota una familia por día hábil y nunca ofrece las pausadas ni EPP', () => {
  const families = rotationFamilies();
  assert.ok(!families.includes('Pisos') && !families.includes('Almohadas') && !families.includes('EPP'));
  const week = [0, 1, 2, 3, 4].map((offset) => familyForDate(new Date(2026, 9, 12 + offset)));
  assert.equal(new Set(week).size, 5, 'cinco días distintos en una semana');
  assert.equal(familyForDate(new Date(2026, 9, 17)), familyForDate(new Date(2026, 9, 18)), 'el fin de semana repite el viernes');
  assert.equal(familyForDate(new Date(2026, 9, 12)), familyForDate(new Date(2026, 9, 12 + 7 * families.length)), 'el ciclo completo vuelve al inicio');
  assert.equal(rotationFamilies({ Pisos: true }).includes('Pisos'), true);
});

test('Baldes se limita a CABA y provincia de Buenos Aires', () => {
  const zones = zonesForFamily('Baldes', cities);
  assert.ok(zones.length > 50);
  assert.ok(zones.every((zone) => zone.prov === '02' || zone.prov === '06'));
  assert.equal(scopeDescription('Baldes'), 'CABA y provincia de Buenos Aires');
});

test('Carrozados Imperpur: Costa Atlántica y 250 km de Mar del Plata, sin CABA', () => {
  const names = zonesForFamily('Carrozados Imperpur', cities).map((zone) => zone.nombre);
  assert.ok(names.includes('Tandil') || names.some((name) => /Tandil/.test(name)));
  assert.ok(names.some((name) => /Dolores/.test(name)));
  assert.ok(!names.includes('Ciudad de Buenos Aires'));
  assert.ok(!names.includes('Córdoba'));
});

test('Penosil recorre todo el país empezando por las zonas más pobladas', () => {
  const zones = zonesForFamily('Penosil', cities);
  assert.ok(zones.length > 2000);
  assert.equal(zones[0].nombre, 'Ciudad de Buenos Aires');
  assert.ok(zones.slice(0, 20).some((zone) => zone.nombre === 'Córdoba'));
});

test('las zonas ya buscadas no se repiten y una agotada vuelve recién pasado el plazo', () => {
  const first = suggestZones('Penosil', cities, [], { count: 3 });
  assert.equal(first.length, 3);
  const log = [
    { family: 'Penosil', zoneId: first[0].zone.id, date: '2026-10-14', found: 40, exhausted: true },
    { family: 'Penosil', zoneId: first[1].zone.id, date: '2026-10-14', found: 12 },
  ];
  assert.equal(zoneStatus('Penosil', first[0].zone.id, log, '2026-10-20').status, 'Agotada por ahora');
  assert.equal(zoneStatus('Penosil', first[1].zone.id, log, '2026-10-20').status, 'En curso');
  assert.equal(zoneStatus('Penosil', first[0].zone.id, log, '2027-01-01').status, 'Pendiente', 'se revisa luego de 60 días');
  const next = suggestZones('Penosil', cities, log, { count: 3, today: '2026-10-20' });
  assert.ok(!next.some((item) => item.zone.id === first[0].zone.id), 'la agotada no se ofrece');
  assert.equal(next[0].status, 'Pendiente');
  assert.equal(zoneStatus('Baldes', first[0].zone.id, log, '2026-10-20').status, 'Pendiente', 'el registro es por familia');
});
