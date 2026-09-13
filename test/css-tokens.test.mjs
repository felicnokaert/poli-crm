import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// Red de seguridad directa contra el incidente del 14/09: un commit
// reemplazó valores literales por var(--token) en toda la hoja de estilos,
// pero el bloque :root solo definía 5 de las ~40 variables usadas. Vite no
// valida esto (CSS inválido en tiempo de cómputo cae al valor heredado del
// navegador en silencio, sin error de build) - este test sí lo hace.
const cssPath = path.resolve(import.meta.dirname, '..', 'src', 'styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

function usedCustomProperties(source) {
  return new Set([...source.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map((m) => m[1]));
}

function definedCustomProperties(source) {
  return new Set([...source.matchAll(/(?:^|[\s{;])(--[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]));
}

test('toda variable CSS usada con var(--x) está definida en algún selector (normalmente :root)', () => {
  const used = usedCustomProperties(css);
  const defined = definedCustomProperties(css);
  const orphaned = [...used].filter((name) => !defined.has(name)).sort();
  assert.deepEqual(orphaned, [], `Variables usadas con var(...) pero nunca definidas: ${orphaned.join(', ')}`);
});

test(':root define al menos los tokens de color básicos que la app depende (fondo/borde/texto)', () => {
  const rootBlockMatch = css.match(/:root\s*{([^}]*)}/);
  assert.ok(rootBlockMatch, 'debe existir un bloque :root');
  const rootBlock = rootBlockMatch[1];
  for (const required of ['--color-white', '--color-forest', '--color-text-muted']) {
    assert.match(rootBlock, new RegExp(`${required}\\s*:`), `falta ${required} en :root`);
  }
});
