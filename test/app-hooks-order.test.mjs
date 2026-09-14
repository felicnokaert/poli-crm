import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Regresión de un incidente real en producción (pantalla en blanco,
// "Uncaught Error: Minified React error #310" - "Rendered more hooks than
// during the previous render"): App() tenía 3 early returns (Splash /
// LoginScreen / pantalla de error) ubicados ANTES de declarar decenas de
// useCallback/useMemo más abajo, en el mismo componente. Mientras la app
// pasaba de "cargando" a "lista" (authReady/session/remoteReady), React
// veía una cantidad de hooks distinta entre un render y el siguiente y
// crasheaba - sin ningún error de servidor, porque el crash es 100% del
// lado del navegador (ver AUDITORIA... no, esto no se documentó en
// ninguna auditoría porque nunca llegó a producción hasta que el deploy
// se destrabó, 3 días después de haberse introducido).
//
// Por qué ningún test lo agarró antes: `authReady` arranca en
// `!onlineConfigured` (ver src/hooks/useWorkspaceSync.js) y bajo test
// (sin VITE_SUPABASE_URL, ver test/helpers/load-jsx.mjs) `onlineConfigured`
// es siempre false - así que `authReady` es `true` desde el primer render
// y la transición peligrosa nunca se ejerce. Mockear todo Supabase para
// forzar esa transición en un test de interacción sería frágil y pesado;
// en cambio, este test verifica directamente la garantía que exige React
// (ningún hook llamado después de un early return) a nivel de código
// fuente - agarra el bug de raíz sin necesitar reproducir el timing real.
test('App() no llama hooks de React después de sus early returns de carga/login (regla de hooks)', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const earlyReturnIndex = source.indexOf('if (!authReady) return');
  assert.ok(earlyReturnIndex > 0, 'no se encontró el early return de authReady en App() - si se renombró, actualizar este test');

  const afterEarlyReturn = source.slice(earlyReturnIndex);
  const hookCallPattern = /\b(useState|useCallback|useMemo|useEffect|useRef|useContext|useReducer|useLayoutEffect)\(/g;
  const found = [...afterEarlyReturn.matchAll(hookCallPattern)].map((m) => m[1]);
  assert.deepEqual(
    found,
    [],
    `Hay ${found.length} llamada(s) a hooks de React después de un early return en App(): ${found.join(', ')}. ` +
    'Esto viola las reglas de hooks y crashea la app con "Rendered more hooks..." (pantalla en blanco) ' +
    'apenas termina de cargar - mover la definición de estos hooks a ANTES de los early returns.',
  );
});
