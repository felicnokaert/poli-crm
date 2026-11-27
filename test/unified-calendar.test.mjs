import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, layersFor, monthDays } from '../src/unified-calendar.mjs';
import { FALLBACK, normalizeHolidays } from '../lib/feriados.mjs';

test('Calendario único: capas según módulos (tareas personales, entregas y cortes compartidos)', () => {
  assert.deepEqual(layersFor((module) => module === 'entregas').map((layer) => layer.id), ['feriados', 'entregas']);
  assert.equal(layersFor().length, 5);
});

test('Calendario único: feriados, tareas, entregas y cortes en su día', () => {
  const days = monthDays(2026, 10); // noviembre 2026
  assert.equal(days.length, 42);
  assert.equal(days[0], '2026-10-26'); // lunes
  const map = buildCalendar({
    days,
    holidays: FALLBACK[2026],
    tasks: [{ id: 't1', title: 'Llamar', dueDate: '2026-11-25' }, { id: 'e1', title: 'Visita', dueDate: '2026-11-25', kind: 'evento', startTime: '10:00' }],
    entregas: [{ id: 'p1', cliente: 'Sur', estado: 'despachado', fecha_despacho: '2026-11-24' }, { id: 'p2', cliente: 'Norte', estado: 'cargado', fecha_remito: '2026-11-26' }],
    cortes: { cortes: [8, 10, 12], calendario: { '2026-11-27': 'sin' } },
  });
  assert.equal(map['2026-11-23'][0].layer, 'feriados');
  assert.ok(!map['2026-11-23'].some((event) => event.layer === 'cortes')); // feriado: sin cortes
  assert.deepEqual(map['2026-11-25'].map((event) => event.layer).sort(), ['cortes', 'eventos', 'tareas']);
  assert.match(map['2026-11-24'].find((event) => event.layer === 'entregas').title, /Despachado · Sur/);
  assert.match(map['2026-11-26'].find((event) => event.layer === 'entregas').title, /Para despachar · Norte/);
  assert.equal(map['2026-11-27'][0].title, 'Sin corte de etiquetas');
  assert.ok(!map['2026-11-28']); // sábado: nada
});

test('Feriados: normaliza la fuente y trae el respaldo de 2026', () => {
  assert.equal(FALLBACK[2026].length, 20);
  assert.deepEqual(normalizeHolidays([{ fecha: '2026-12-25', nombre: 'Navidad', tipo: 'inamovible' }, { fecha: 'x' }]).length, 1);
});

test('Días de la empresa: cerrado corta los cortes; medio día los deja y avisa la hora', async () => {
  const { cleanCompanyDay, asHolidays } = await import('../lib/company-days.mjs');
  assert.ok(cleanCompanyDay({ fecha: '2026-12-02', nombre: 'x' }).error);
  const a = cleanCompanyDay({ fecha: '2026-12-02', nombre: 'Día del plástico' }, { email: 'F@x' }).day;
  const b = cleanCompanyDay({ fecha: '2026-12-23', nombre: 'Fiesta de fin de año', tipo: 'medio-dia', desde: '12:30' }).day;
  assert.equal(a.tipo, 'cerrado'); assert.equal(b.desde, '12:30');
  const holidays = asHolidays([a, b, { fecha: '2027-01-02', nombre: 'otro año', tipo: 'cerrado' }], 2026);
  assert.equal(holidays.length, 2);
  const map = buildCalendar({ days: ['2026-12-02', '2026-12-23'], holidays, cortes: { cortes: [8], calendario: {} } });
  assert.ok(!map['2026-12-02'].some((event) => event.layer === 'cortes'));
  assert.ok(map['2026-12-23'].some((event) => event.layer === 'cortes'));
  assert.match(map['2026-12-23'].find((event) => event.layer === 'feriados').detail, /12:30/);
});
