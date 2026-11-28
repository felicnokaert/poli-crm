import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// 28/11: las pantallas de Logística (Dosificado, Conteo, Etiquetas) tienen su propio CSS; su modo oscuro se genera aparte y
// tiene que estar al día con esas hojas (si no, se ven claras en modo noche).
test('Logística: modo oscuro generado y al día', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/build-dark-logistica.mjs', '--check'], { stdio: 'pipe' }));
});
