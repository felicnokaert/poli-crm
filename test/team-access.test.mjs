import test from 'node:test';
import assert from 'node:assert/strict';
import { accessAllows, newPerson, setRole, toggleAccess, changesCount } from '../src/team-access.mjs';
import { isDemoMode, withDemoData } from '../src/demo-mode.mjs';
import { demoWorkspace, demoModules } from '../src/demo-data.mjs';

test('Equipo y cuentas: el rol da los módulos y Felipe suma o saca encima', () => {
  let diego = { email: 'd@grupopoliplast.com.ar', role: 'deposito', overrides: {} };
  assert.equal(accessAllows(diego, 'sales'), false);
  assert.equal(accessAllows(diego, 'etiquetas'), true);
  diego = toggleAccess(diego, 'sales');
  assert.equal(accessAllows(diego, 'sales'), true);
  diego = toggleAccess(diego, 'etiquetas', 'Devoluciones');
  assert.equal(accessAllows(diego, 'etiquetas', 'Devoluciones'), false);
  assert.equal(accessAllows(diego, 'etiquetas', 'Escaneo'), true);
  assert.equal(changesCount(diego), 2);
  diego = toggleAccess(diego, 'sales'); // vuelve a lo del rol: se borra la excepción
  assert.equal(changesCount(diego), 1);
  assert.equal(changesCount(setRole(diego, 'comercial')), 0);
});

test('Equipo y cuentas: solo mails de la empresa', () => {
  assert.ok(newPerson({ email: 'alguien@gmail.com', role: 'comercial' }).error);
  assert.equal(newPerson({ email: ' Nuevo@GrupoPoliplast.com.ar ', role: 'expedicion' }).person.email, 'nuevo@grupopoliplast.com.ar');
});

test('Modo de prueba: solo en el link de prueba y nunca con la base conectada', () => {
  const storage = new Map();
  const fake = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  assert.equal(isDemoMode({ online: false, location: { hostname: 'poli-crm-git-poliplast-app-felicnokaerts-projects.vercel.app', search: '' }, storage: fake }), true);
  assert.equal(isDemoMode({ online: true, location: { hostname: 'poli-crm-git-poliplast-app-felicnokaerts-projects.vercel.app', search: '' }, storage: fake }), false);
  assert.equal(isDemoMode({ online: false, location: { hostname: 'poli-crm.vercel.app', search: '' }, storage: fake }), false);
  const first = withDemoData({ clients: [] }, { storage: fake });
  assert.equal(first.clients.length, 36);
  assert.equal(withDemoData({ clients: [] }, { storage: fake }).clients.length, 0); // no vuelve a cargar encima
});

test('Datos de prueba: siempre los mismos y marcados como inventados', () => {
  assert.deepEqual(demoWorkspace(11, '2026-11-25').clients[0], demoWorkspace(11, '2026-11-25').clients[0]);
  assert.ok(demoWorkspace().clients.every((client) => client.notes.includes('inventado')));
  const modules = demoModules();
  for (const key of ['etiquetas', 'conteo', 'dosificado', 'recibos', 'facturacion', 'compras', 'entregas']) assert.ok(modules[key].length > 0, key);
});

test('Equipo y cuentas: cambios a escribir en module_access y claves de submódulos de siempre', async () => {
  const { overrideChanges, overridesFromRows, childKey } = await import('../src/team-access.mjs');
  assert.deepEqual(overridesFromRows([{ module: 'sales', allowed: false }, { module: 'etiquetas', allowed: true }]), { sales: false, etiquetas: true });
  assert.deepEqual(overrideChanges({ sales: false, map: false }, { sales: true, etiquetas: false }), { upserts: [{ module: 'sales', allowed: true }, { module: 'etiquetas', allowed: false }], deletes: ['map'] });
  assert.equal(childKey('mercadolibre', 'Dinero (stock, ganancia y publicidad)'), 'mercadolibre.dinero');
  // Una cuenta de antes, sin rol: ve todo salvo lo que se le sacó.
  assert.equal(accessAllows({ role: '', overrides: { sales: false } }, 'map'), true);
  assert.equal(accessAllows({ role: '', overrides: { sales: false } }, 'sales'), false);
});

test('Inicio: el orden se guarda en el espacio de trabajo y gana el más reciente', async () => {
  const { mergeWorkspaceState } = await import('../src/workspace.mjs');
  const older = { order: ['plan'], hidden: [], updatedAt: '2026-11-25T10:00:00Z' };
  const newer = { order: ['metricas'], hidden: ['plan'], updatedAt: '2026-11-25T11:00:00Z' };
  assert.deepEqual(mergeWorkspaceState({ homeLayout: older }, { homeLayout: newer }).homeLayout, newer);
  assert.deepEqual(mergeWorkspaceState({ homeLayout: newer }, { homeLayout: older }).homeLayout, newer);
});
