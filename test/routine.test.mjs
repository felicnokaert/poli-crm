import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineForDate, routineKey, routineProgress, routineStreak, specialsForDate, weekDates, hoursLabel } from '../src/routine.mjs';

test('la rutina de un día hábil suma 6,5 h de base y 8 h completa', () => {
  const day = routineForDate('2026-10-16');
  assert.equal(day.weekend, false);
  assert.equal(day.baseMinutes, 390);
  assert.equal(day.totalMinutes, 480);
  assert.equal(hoursLabel(390), '6 h 30 min');
});

test('el bloque del día cambia según el día y el viernes es el cierre comercial', () => {
  const titles = weekDates('2026-10-16').map((date) => routineForDate(date).blocks.find((block) => block.id === 'dia').title);
  assert.deepEqual(titles, ['Mercado Libre', 'Shopify: catálogo y SEO', 'Contenido y guiones', 'Shopify: ventas y operación', 'Cierre comercial de la semana']);
  assert.equal(weekDates('2026-10-16')[4], '2026-10-16');
});

test('sábado y domingo no tienen rutina', () => {
  assert.equal(routineForDate('2026-10-17').weekend, true);
  assert.equal(routineForDate('2026-10-18').weekend, true);
});

test('el progreso y la racha cuentan solo la rutina base completa', () => {
  const checks = {};
  for (const date of ['2026-10-14', '2026-10-15']) for (const block of routineForDate(date).blocks.filter((item) => !item.extra)) checks[routineKey(date, block.id)] = true;
  assert.equal(routineProgress(checks, '2026-10-15').baseDone, 6);
  assert.equal(routineStreak(checks, '2026-10-15'), 2);
  assert.equal(routineStreak(checks, '2026-10-16'), 2, 'hoy sin completar no corta la racha de ayer');
  checks[routineKey('2026-10-15', 'cierre')] = false;
  assert.equal(routineStreak(checks, '2026-10-16'), 0);
});

test('avisos puntuales: evaluación de 90 días a fin de octubre', () => {
  assert.ok(specialsForDate('2026-10-30').some((line) => /90 días/.test(line)));
  assert.ok(specialsForDate('2026-11-01').some((line) => /balance del mes/.test(line)));
  assert.deepEqual(specialsForDate('2026-10-20'), []);
});
