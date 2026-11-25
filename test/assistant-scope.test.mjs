import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeFor, scopedContext, scopedTools, scopeAllows } from '../lib/assistant-scope.mjs';

const parts = [
  { module: null, text: 'REGLAS' },
  { module: 'clients', text: 'Cliente X compró 1.000.000' },
  { module: 'sales', text: 'Ventas del mes' },
  { module: 'entregas', text: 'Pedidos de hoy' },
];
const tools = [{ name: 'crear_tarea' }, { name: 'anotar_en_cliente' }, { name: 'guardar_respuesta' }];

test('Asistente por rol: expedición no recibe clientes ni ventas', () => {
  const scope = { admin: false, role: 'expedicion', denied: new Set(), known: true };
  assert.equal(scopedContext({ contextParts: parts }, scope), 'REGLAS\nPedidos de hoy');
  assert.deepEqual(scopedTools(tools, scope).map((tool) => tool.name), ['guardar_respuesta']);
  // Texto suelto (navegador viejo) con rol: no pasa nada.
  assert.equal(scopedContext({ context: 'Cliente X compró' }, scope), '');
});

test('Asistente por rol: el administrador recibe todo', () => {
  const scope = { admin: true, role: 'admin', denied: new Set(), known: true };
  assert.equal(scopedContext({ contextParts: parts }, scope).split('\n').length, 4);
  assert.equal(scopedTools(tools, scope).length, 3);
});

test('Asistente por rol: un módulo quitado por Felipe también se saca', () => {
  const scope = { admin: false, role: 'comercial', denied: new Set(['sales']), known: true };
  assert.ok(!scopedContext({ contextParts: parts }, scope).includes('Ventas del mes'));
  assert.ok(scopedContext({ contextParts: parts }, scope).includes('Cliente X'));
  assert.equal(scopeAllows(scope, 'entregas'), true);
});

test('Asistente por rol: lee rol y permisos de la base; expedición queda fija aunque falle', async () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const http = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('app_user_roles') ? [{ role: 'deposito' }] : [{ module: 'techdocs', allowed: false }]), text: async () => '' });
  const scope = await scopeFor('diego@grupopoliplast.com.ar', env, http);
  assert.equal(scope.role, 'deposito');
  assert.ok(scope.denied.has('techdocs'));
  const broken = async () => { throw new Error('caída'); };
  const fixed = await scopeFor('expedicion@grupopoliplast.com.ar', env, broken);
  assert.equal(fixed.role, 'expedicion');
  assert.equal(scopeAllows(fixed, 'clients'), false);
});
