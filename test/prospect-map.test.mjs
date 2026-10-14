import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { loadJsxModule } from './helpers/load-jsx.mjs';
import { BOUNDS, MAP_SIZE, clusterPoints, filterPoints, mapPoints, project, provincePaths, unitOfFamily, familiesForUnit, UNITS } from '../src/prospect-map.mjs';

afterEach(cleanup);

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const cities = read('../public/mapa/data/ciudades.json').ciudades;
const geo = read('../public/mapa/data/provincias.geojson');

test('la proyección ubica el norte arriba y el oeste a la izquierda', () => {
  const nw = project(BOUNDS.latMax, BOUNDS.lonMin);
  assert.deepEqual(nw, { x: 0, y: 0 });
  const se = project(BOUNDS.latMin, BOUNDS.lonMax);
  assert.ok(Math.abs(se.x - MAP_SIZE.width) < 1e-6 && Math.abs(se.y - MAP_SIZE.height) < 1e-6);
  assert.ok(project(-34.6, -58.4).y < project(-45, -58.4).y);
});

test('los contornos de provincias se dibujan como caminos de SVG', () => {
  const paths = provincePaths(geo);
  assert.ok(paths.length >= 20);
  assert.ok(paths.every((item) => item.d.startsWith('M') && item.d.endsWith('Z')));
  assert.deepEqual(provincePaths(null), []);
});

const locate = (item) => (Number.isFinite(item.lat) ? { lat: item.lat, lon: item.lon } : null);

test('los pines salen de los prospectos y los sin ubicar se cuentan aparte', () => {
  const prospects = [
    { id: 'a', company: 'A', family: 'Penosil', state: 'Contactado', lat: -31.7, lon: -60.5, createdAt: '2026-10-01T10:00:00Z' },
    { id: 'b', company: 'B', family: 'Resinplast', state: 'No contactado', createdAt: '2026-10-02T10:00:00Z' },
  ];
  const result = mapPoints({ prospects, locate });
  assert.equal(result.points.length, 1);
  assert.equal(result.unlocated, 1);
  assert.equal(result.points[0].unit, unitOfFamily('Penosil'));
});

test('los clientes del CRM solo aparecen si se pide y sin repetir los ya vinculados', () => {
  const prospects = [{ id: 'a', company: 'A', family: 'Penosil', state: 'Contactado', lat: -31, lon: -60, linkedClientId: 'c1' }];
  const clients = [
    { id: 'c1', company: 'A', family: 'Penosil', lat: -31, lon: -60 },
    { id: 'c2', company: 'C', family: 'Penosil', lat: -32, lon: -61 },
    { id: 'c3', company: 'D', family: 'Otra cosa', lat: -33, lon: -62 },
  ];
  assert.equal(mapPoints({ prospects, clients, locate }).points.length, 1);
  const withClients = mapPoints({ prospects, clients, includeClients: true, locate }).points;
  assert.deepEqual(withClients.map((item) => item.id), ['a', 'c2']);
  assert.equal(withClients[1].state, 'Cliente');
});

test('los filtros combinan unidad, familia, estado, provincia, localidad y fechas', () => {
  const points = [
    { id: 1, unit: 'PENOSIL', family: 'Penosil', state: 'Contactado', province: 'Entre Ríos', city: 'Paraná', date: '2026-10-05' },
    { id: 2, unit: 'PENOSIL', family: 'Penosil', state: 'Sin interés', province: 'Córdoba', city: 'Río Cuarto', date: '2026-09-01' },
    { id: 3, unit: 'RESINPLAST', family: 'Resinplast', state: 'Contactado', province: 'Entre Ríos', city: 'Paraná', date: '2026-10-06' },
  ];
  const ids = (filters) => filterPoints(points, filters).map((item) => item.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ unit: 'PENOSIL' }), [1, 2]);
  assert.deepEqual(ids({ family: 'Resinplast' }), [3]);
  assert.deepEqual(ids({ state: 'Contactado', province: 'Entre Ríos' }), [1, 3]);
  assert.deepEqual(ids({ city: 'rio cuarto'.replace('rio', 'río') }), [2]);
  assert.deepEqual(ids({ from: '2026-10-01', to: '2026-10-05' }), [1]);
});

test('la agrupación junta pines cercanos con un celdas grandes y los separa con celdas chicas', () => {
  const near = [
    { id: 1, lat: -34.60, lon: -58.40, state: 'Contactado' },
    { id: 2, lat: -34.61, lon: -58.41, state: 'Contactado' },
    { id: 3, lat: -34.62, lon: -58.39, state: 'Sin interés' },
  ];
  const big = clusterPoints(near, 50);
  assert.equal(big.length, 1);
  assert.equal(big[0].count, 3);
  assert.equal(big[0].state, 'Contactado');
  assert.equal(clusterPoints(near, 0.05).length, 3);
});

test('cada unidad lista solo sus familias', () => {
  assert.ok(UNITS.includes('PENOSIL'));
  assert.ok(familiesForUnit('PENOSIL').includes('Penosil'));
  assert.ok(!familiesForUnit('PENOSIL').includes('Resinplast'));
  assert.ok(familiesForUnit('').length >= 10);
});

describe('ProspeccionMapa.jsx', () => {
  async function mount(data) {
    const mod = await loadJsxModule('src/ProspeccionMapa.jsx');
    render(React.createElement(mod.ProspeccionMapa, { data, onOpenClient: () => {}, cities, provincesGeo: geo }));
  }

  test('sin prospectos muestra el mapa vacío y la tabla de déficit por población', async () => {
    await mount({ clients: [], prospects: [] });
    assert.ok(screen.getByRole('img', { name: 'Mapa de prospección' }));
    assert.ok(screen.getByText(/0 pines/));
    assert.ok(screen.getByText(/todavía no tiene datos: se ordena por población/));
    assert.ok(screen.getAllByText('Ciudad de Buenos Aires').length >= 1);
  });

  test('un prospecto ubicado por su ciudad aparece y el filtro de estado lo oculta', async () => {
    await mount({ clients: [], prospects: [{ id: 'p1', company: 'Ferretería Norte', family: 'Penosil', state: 'Contactado', city: 'Córdoba', province: 'Córdoba', createdAt: '2026-10-10T00:00:00Z' }] });
    await waitFor(() => screen.getByText(/1 pines/));
    fireEvent.change(screen.getByLabelText('Estado del mapa'), { target: { value: 'Sin interés' } });
    await waitFor(() => screen.getByText(/0 pines/));
  });

  test('los prospectos sin localidad se avisan como sin ubicar', async () => {
    await mount({ clients: [], prospects: [{ id: 'p2', company: 'Sin lugar', family: 'Penosil', state: 'No contactado' }] });
    await waitFor(() => screen.getByText(/1 prospectos sin ubicar/));
  });
});
