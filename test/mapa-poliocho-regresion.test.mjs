// El mapa de cobertura de POLIOCHO no se toca al agregar la Prospección.
// Si alguien cambia estos archivos a propósito, se actualizan los hashes acá.
// 14/10/2026: a pedido de Felipe el mapa pasa a ser el de aplicadores (RAPYP): título, tipo
// 'Aplicadores' por defecto y emails largos que se ajustan a la ficha. La lógica no cambió.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildMapClients } from '../src/map-clients-adapter.mjs';

const sha = (path) => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');

const BASELINE = {
  'public/mapa/app.js': '7ad4699b54a03f9136f20b07aadc94b57ba4626bf4cb83ef7edb6675663700d9',
  'public/mapa/alcance.mjs': '46af72300b46d1cbfa04642776e0568db8fd6881eefe82dd1489748f40c50548',
  'public/mapa/contacto.mjs': '23c7f5107a2ecc472cd7e9d1bcef5b912b80f4edb836d66f81b696d74a0fbf97',
  'public/mapa/nombres-ciudad.mjs': 'c294ef7eb55c7f70fbf77192dbbd588173a78ab03712a418f5744ad171ddb327',
  'public/mapa/index.html': '9193aa1b654d61f6e436c4e444c66261a22d3af58a753d7dc419b3fb824c847d',
  'public/mapa/styles.css': '82017163627a14defafd4cc666613ce7eca16bc29e026ebe040fb8e2c8b23955',
  'src/MapaCobertura.jsx': 'a85227cd2ac0a78f801a3201350b55ea3ec2a479e2848b51d73cc8ebc1098a3e',
  'src/map-clients-adapter.mjs': 'af90decc888afb07b647a95d3bc40b09bd221b2574ab7b1d2cbfb91b6425960d',
};

test('los archivos del mapa de aplicadores (RAPYP) no cambiaron', () => {
  for (const [path, hash] of Object.entries(BASELINE)) assert.equal(sha(path), hash, `${path} cambió`);
});

test('el mapa de POLIOCHO recibe solo las empresas, nunca los prospectos', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const line = app.split('\n').find((item) => item.includes('<MapaCobertura '));
  assert.ok(line && line.includes('clients={data.clients}'));
  assert.ok(!/prospect/i.test(line));
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
