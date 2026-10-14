// El mapa de cobertura de POLIOCHO no se toca al agregar la Prospección.
// Si alguien cambia estos archivos a propósito, se actualizan los hashes acá.
// 14/10/2026 (2): se agrega el modo ?modo=ventas (mismo mapa, clientes que no son aplicadores) y la familia en la ficha; el modo aplicadores no cambia.
// 14/10/2026: a pedido de Felipe el mapa pasa a ser el de aplicadores (RAPYP): título, tipo
// 'Aplicadores' por defecto y emails largos que se ajustan a la ficha. La lógica no cambió.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildMapClients } from '../src/map-clients-adapter.mjs';

const sha = (path) => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');

const BASELINE = {
  'public/mapa/app.js': '67b6b5fb410ccb222fb5858c5031b47d99bc4f49ea317bdb188cb2c8e11bdebf',
  'public/mapa/alcance.mjs': '46af72300b46d1cbfa04642776e0568db8fd6881eefe82dd1489748f40c50548',
  'public/mapa/contacto.mjs': '23c7f5107a2ecc472cd7e9d1bcef5b912b80f4edb836d66f81b696d74a0fbf97',
  'public/mapa/nombres-ciudad.mjs': 'c294ef7eb55c7f70fbf77192dbbd588173a78ab03712a418f5744ad171ddb327',
  'public/mapa/index.html': 'ed1d929a8b196d066f4c607a51c488b6eea914e3ce24c5c4156e997bfb449bab',
  'public/mapa/styles.css': 'fc0a3c4fe9a7c68e94a737e1f5040ccb76de8584e635d348f4b5ad0231ec67c0',
  'src/MapaCobertura.jsx': '5c2c57fd8ef90c83a543e3d735d020350318e47bb76e46241e9548a4973bccdb',
  'src/map-clients-adapter.mjs': 'da3ab7945c08173f12babb42ff50af779f454a5c0b5c7cc7f69fc7a92867001c',
};

test('los archivos del mapa de aplicadores (RAPYP) no cambiaron', () => {
  for (const [path, hash] of Object.entries(BASELINE)) assert.equal(sha(path), hash, `${path} cambió`);
});

test('el mapa de POLIOCHO recibe solo las empresas, nunca los prospectos', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const line = app.split('\n').find((item) => item.includes('<MapaCobertura '));
  assert.ok(line && line.includes('clients={data.clients}'));
  assert.ok(!/prospect/i.test(line));
  // Solo la pestaña Prospectos recibe prospectos; las de aplicadores y ventas reciben únicamente empresas.
  const lines = app.split('\n').filter((item) => item.includes('<MapaCobertura '));
  assert.equal(lines.filter((item) => /prospects=/.test(item)).length, 1);
  assert.ok(lines.filter((item) => !item.includes('modo="prospectos"')).every((item) => !/prospect/i.test(item)));
  const result = buildMapClients([{ id: 'c1', company: 'X', family: 'Penosil', city: 'Córdoba' }]);
  assert.ok(JSON.stringify(result).indexOf('prospect') === -1);
});

test('la Prospección no usa los archivos de datos propios del mapa de POLIOCHO para escribir', () => {
  const source = readFileSync(new URL('../src/ProspeccionMapa.jsx', import.meta.url), 'utf8');
  assert.ok(!source.includes('MapaCobertura'));
  assert.ok(!source.includes('/mapa/index.html'));
});

test('el mapa de aplicadores abre mostrando todos los clientes (como antes) y la ficha ajusta los emails largos', () => {
  const html = readFileSync(new URL('../public/mapa/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<option value="aplicador" selected>/);
  const css = readFileSync(new URL('../public/mapa/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.cliente a \{[^}]*overflow-wrap: anywhere/);
});
