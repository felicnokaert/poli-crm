import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';

afterEach(cleanup);

test('crear un evento con hora lo muestra en el día y pasa los datos a guardar', async () => {
  const { Calendar } = await loadJsxModule('src/Calendar.jsx');
  const saved = [];
  render(React.createElement(Calendar, { tasks: [], date: '2026-10-19', onAddEvent: (form) => saved.push(form) }));
  fireEvent.click(screen.getByRole('button', { name: /Nuevo evento/ }));
  fireEvent.change(screen.getByLabelText(/Qué es/), { target: { value: 'Visita Astillero Sur' } });
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '10:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar evento' }));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, 'Visita Astillero Sur');
  assert.equal(saved[0].startTime, '10:30');
  assert.equal(saved[0].date, '2026-10-19');
});

test('los eventos del día se listan con su hora y antes que las tareas', async () => {
  const { Calendar } = await loadJsxModule('src/Calendar.jsx');
  const tasks = [
    { id: 't', title: 'Tarea suelta', dueDate: '2026-10-19', priority: 'Media' },
    { id: 'e2', kind: 'evento', title: 'Llamada tarde', dueDate: '2026-10-19', startTime: '15:00', priority: 'Media' },
    { id: 'e1', kind: 'evento', title: 'Visita mañana', dueDate: '2026-10-19', startTime: '09:00', endTime: '10:00', priority: 'Media' },
  ];
  render(React.createElement(Calendar, { tasks, date: '2026-10-19' }));
  const text = document.querySelector('.calendar-detail').textContent;
  assert.ok(text.indexOf('Visita mañana') < text.indexOf('Llamada tarde'));
  assert.ok(text.indexOf('Llamada tarde') < text.indexOf('Tarea suelta'));
  assert.ok(screen.getByText('09:00–10:00'));
});

test('exportar descarga un .ics con lo elegido', async () => {
  const { Calendar } = await loadJsxModule('src/Calendar.jsx');
  const blobs = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = () => {};
  try {
    render(React.createElement(Calendar, { tasks: [{ id: 't', title: 'Duplicados SKU', dueDate: '2026-10-20' }], date: '2026-10-19' }));
    fireEvent.click(screen.getByRole('button', { name: /Exportar a Google Calendar/ }));
    fireEvent.click(screen.getByLabelText(/Bloques de la rutina/));
    fireEvent.click(screen.getByRole('button', { name: /Descargar archivo/ }));
    assert.equal(blobs.length, 1);
    const text = await blobs[0].text();
    assert.match(text, /SUMMARY:Tarea: Duplicados SKU/);
    assert.doesNotMatch(text, /Rutina ·/);
    assert.ok(screen.getByText(/Se descargó el archivo con 1 evento/));
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    window.HTMLAnchorElement.prototype.click = originalClick;
  }
});

test('el atajo de Google Calendar usa la hora y el lugar de los eventos', async () => {
  const { googleCalendarUrl } = await loadJsxModule('src/app-shared.jsx');
  const url = new URL(googleCalendarUrl({ title: 'Visita', dueDate: '2026-10-19', startTime: '10:30', endTime: '12:00', kind: 'evento', place: 'Tigre' }));
  assert.equal(url.searchParams.get('dates'), '20261019T103000/20261019T120000');
  assert.equal(url.searchParams.get('location'), 'Tigre');
  const day = new URL(googleCalendarUrl({ title: 'Tarea', dueDate: '2026-10-19' }));
  assert.equal(day.searchParams.get('dates'), '20261019/20261020');
});
