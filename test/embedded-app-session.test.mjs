import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 20/11: al generalizar CotizadorFrame en EmbeddedAppFrame se perdió el envío de la sesión y Entregas y el
// Cotizador, adentro del CRM, pedían usuario y contraseña. Que no vuelva a pasar.
test('EmbeddedAppFrame le manda la sesión del CRM a la app de adentro', () => {
  const source = readFileSync(new URL('../src/EmbeddedAppFrame.jsx', import.meta.url), 'utf8');
  assert.match(source, /tipo:\s*"crm:sesion"/);
  assert.match(source, /access_token:\s*session\.access_token/);
  assert.match(source, /refresh_token:\s*session\.refresh_token/);
  assert.match(source, /postMessage\([\s\S]*?crm:sesion[\s\S]*?,\s*origin,?\s*\)/);
});

test('Entregas y Cotizador le pasan la sesión al marco', () => {
  for (const file of ['EntregasFrame.jsx', 'CotizadorFrame.jsx']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /session=\{session\}/, file);
  }
});
