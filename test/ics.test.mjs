import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, icsEscape, icsFold } from '../src/ics.mjs';

const NOW = new Date('2026-10-16T12:00:00Z');

test('escapa texto y corta líneas largas', () => {
  assert.equal(icsEscape('a, b; c\nd'), 'a\\, b\; c\\nd');
  const folded = icsFold(`SUMMARY:${'x'.repeat(200)}`);
  assert.ok(folded.split('\r\n').every((line) => line.length <= 75));
});

test('exporta rutina con horario, eventos con hora y tareas de día completo', () => {
  const tasks = [
    { id: 't1', title: 'Duplicados SKU', dueDate: '2026-10-19', trelloUrl: 'https://trello.com/c/x' },
    { id: 'e1', kind: 'evento', title: 'Visita Astillero Sur', dueDate: '2026-10-19', startTime: '10:30', endTime: '12:00', place: 'Tigre', company: 'Astillero Sur' },
    { id: 'e2', kind: 'evento', title: 'Llamada', dueDate: '2026-10-19', startTime: '15:00' },
    { id: 'hecha', title: 'Ya hecha', dueDate: '2026-10-19', done: true },
    { id: 'fuera', title: 'Fuera de rango', dueDate: '2027-01-05' },
  ];
  const { text, count } = buildIcs(tasks, { from: '2026-10-19', to: '2026-10-19', now: NOW });
  assert.equal(count, 9 + 3);
  assert.match(text, /BEGIN:VCALENDAR/);
  assert.match(text, /DTSTART;TZID=America\/Argentina\/Buenos_Aires:20261019T083000/);
  assert.match(text, /SUMMARY:Rutina · Arranque/);
  assert.match(text, /DTSTART;TZID=America\/Argentina\/Buenos_Aires:20261019T103000/);
  assert.match(text, /DTEND;TZID=America\/Argentina\/Buenos_Aires:20261019T120000/);
  assert.match(text, /LOCATION:Tigre/);
  assert.match(text, /DTEND;TZID=America\/Argentina\/Buenos_Aires:20261019T160000/, 'sin fin: dura 1 hora');
  assert.match(text, /DTSTART;VALUE=DATE:20261019/);
  assert.match(text, /DTEND;VALUE=DATE:20261020/);
  assert.match(text, /SUMMARY:Tarea: Duplicados SKU/);
  assert.doesNotMatch(text, /Ya hecha|Fuera de rango/);
  assert.match(text, /UID:evento-e1@poli-crm/);
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});

test('las opciones apagan la rutina, las tareas o los eventos y se saltean los feriados', () => {
  const tasks = [{ id: 't', title: 'T', dueDate: '2026-10-19' }, { id: 'e', kind: 'evento', title: 'E', dueDate: '2026-10-19', startTime: '09:00' }];
  assert.equal(buildIcs(tasks, { from: '2026-10-19', to: '2026-10-19', routine: false, now: NOW }).count, 2);
  assert.equal(buildIcs(tasks, { from: '2026-10-19', to: '2026-10-19', routine: false, includeTasks: false, now: NOW }).count, 1);
  assert.equal(buildIcs(tasks, { from: '2026-10-19', to: '2026-10-19', routine: false, includeEvents: false, now: NOW }).count, 1);
  assert.equal(buildIcs([], { from: '2026-12-08', to: '2026-12-08', skipDays: ['2026-12-08'], now: NOW }).count, 0);
  assert.equal(buildIcs([], { from: '2026-10-17', to: '2026-10-18', now: NOW }).count, 0, 'sin rutina el fin de semana');
});
