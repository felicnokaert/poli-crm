import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWeather, parseGeocode, parseWeather, timeIn, weatherUrl } from '../src/local-info.mjs';

test('la hora sale en la zona pedida', () => {
  const now = new Date('2026-10-16T15:30:00Z');
  assert.equal(timeIn('America/Argentina/Buenos_Aires', now), '12:30');
  assert.equal(timeIn('UTC', now), '15:30');
});

test('códigos de clima a texto', () => {
  assert.deepEqual(describeWeather(0), ['Despejado', '☀️']);
  assert.equal(describeWeather(63)[0], 'Lluvia');
  assert.equal(describeWeather(96)[0], 'Tormenta');
});

test('parseWeather y parseGeocode toleran respuestas vacías', () => {
  assert.deepEqual(parseWeather({ current: { temperature_2m: 14.6, weather_code: 3 }, timezone: 'America/Argentina/Buenos_Aires' }), { temp: 15, label: 'Nublado', icon: '☁️', timezone: 'America/Argentina/Buenos_Aires' });
  assert.equal(parseWeather({}), null);
  assert.equal(parseGeocode({ results: [] }), null);
  assert.deepEqual(parseGeocode({ results: [{ name: 'Salta', admin1: 'Salta', latitude: -24.8, longitude: -65.4, timezone: 'America/Argentina/Salta' }] }), { name: 'Salta, Salta', latitude: -24.8, longitude: -65.4, timezone: 'America/Argentina/Salta' });
});

test('la URL del clima incluye coordenadas', () => {
  assert.match(weatherUrl({ latitude: -38, longitude: -57 }), /latitude=-38&longitude=-57/);
});

test('el componente muestra la hora y el clima de los lugares', async () => {
  const React = (await import('react')).default;
  const { render, screen, cleanup } = await import('@testing-library/react');
  const { loadJsxModule } = await import('./helpers/load-jsx.mjs');
  const { LocalInfo } = await loadJsxModule('src/LocalInfo.jsx');
  const fetcher = async () => ({ json: async () => ({ current: { temperature_2m: 12.2, weather_code: 0 }, timezone: 'America/Argentina/Buenos_Aires' }) });
  render(React.createElement(LocalInfo, { fetcher }));
  assert.ok(screen.getByText(/Mar del Plata/));
  assert.ok(screen.getByText(/Berazategui/));
  await screen.findAllByText(/12°/);
  cleanup();
});
