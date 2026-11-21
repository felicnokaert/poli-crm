import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// 21/11 (Felipe: «los módulos nuevos no respetan el modo noche»): theme-dark.css se genera desde styles.css y se había
// quedado viejo (unas 40 pantallas nuevas sin oscuro). Si se agrega un estilo con fondo claro y no se regenera, esto falla.
test('el modo oscuro está regenerado con los estilos actuales', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/build-dark-theme.mjs', '--check'], { stdio: 'pipe' }));
});
