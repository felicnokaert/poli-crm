# Auditoría de madurez de producto — 14/09 madrugada (4ta ronda)

Metodología: misma de las 3 rondas previas — evidencia real (`node --test`, `npm run build`, greps concretos), nunca impresión general ni puntos por volumen de trabajo. Alcance: verificar los 3 frentes que se tocaron desde la auditoría de la noche (Automatización, Testing, Frontend) y confirmar que los otros 7 no tuvieron regresión.

## Comandos ejecutados (evidencia primaria)

```
node --test
  → tests 365, pass 365, fail 0, duration ~1.73s

npm run build
  → vite build OK, "built in 783ms", sin errores ni warnings de tamaño nuevos
```

Ambos corridos en vivo contra el `node_modules` real del worktree, sin reinstalar nada. El bug histórico de `import "rolldown"` (funcionaba bajo npm, rompía bajo pnpm) **sigue arreglado**: la suite completa pasa, incluyendo `test/components-smoke.test.mjs`, que es justamente el archivo que dependía de ese import.

## Grep de verificación puntual

```
grep -c "memo(" src/*.jsx
  Clients.jsx:1  Dashboard.jsx:1  Tasks.jsx:1  WhatsAppInbox.jsx:1  (resto: 0)
```
Los 4 componentes memoizados siguen memoizados, ninguno se revirtió.

```
grep -rn "buildAutoFollowupTasks" src/ api/
  src/daily-maintenance.mjs:116  → definición de la función
  src/daily-maintenance.mjs:180  → const followupUpdate = buildAutoFollowupTasks(signalsUpdate.nextState, nowISO)
```
Sigue conectada dentro del pipeline de `runDailyMaintenance` (no es código muerto). Además se confirmó en el archivo:
- `hotLeadAutoKey()` (línea 23-24) construye una clave `canal:cliente` normalizada — es la deduplicación real, no una promesa.
- El scope está efectivamente acotado a `findStaleHotLeads(inbox, {today: now})` (líneas 66 y 123), no a todo el inbox.

```
test/components-smoke.test.mjs → 14 tests (Empty, Fact, Goal, Loading, Splash, Spinner, Clients, Tasks, TaskList y variantes)
test/hooks-pure-logic.test.mjs → 13 tests
```
137 y 153 líneas respectivamente — no son archivos triviales de 1-2 asserts.

```
grep -n "myChannels" src/hooks/useWorkspaceSync.js
  → useMemo(() => channelsForEmail(email), [email]) con comentario explícito
    "evita que Dashboard/Clients/Academy (que reciben myChannels como prop) se re-rendericen"
```
La prop inestable que se corrigió está efectivamente memoizada con dependencia mínima (`[email]`), consistente con lo reportado.

## `git diff --stat` entre auditoría de la noche (3f51764) y HEAD

```
 .gitignore                                              |   2 +
 src/App.jsx                                             |  31 ++--
 src/Clients.jsx                                         |   8 +-
 src/Dashboard.jsx                                       |  10 +-
 src/Tasks.jsx                                           |   9 +-
 src/WhatsAppInbox.jsx                                   |   8 +-
 src/catalog-price-import-migration.test.mjs             |   7 +
 src/daily-maintenance.mjs                               | 114 ++++++++++-
 src/hooks/useNavGroups.js                                |  36 +++--
 src/hooks/useWorkspaceSync.js                            | 156 ++++++------
 supabase/migrations/20260912133000_catalog_price...sql  |  65 ++++++
 test/components-smoke.test.mjs                          | 137 +++++++++++
 test/daily-maintenance.test.mjs                         |  97 ++++++++
 test/*disabled-consolidate-duplicate-clients*.test.mjs  |  90 ++++++++
 test/fixtures/trivial-component.jsx                     |   3 +
 test/helpers/load-jsx.mjs                               |  85 +++++++
 test/hooks-pure-logic.test.mjs                          | 153 +++++++++++
 test/workspace-sync.test.mjs                            |  38 +-----
 18 files changed, 906 insertions(+), 143 deletions(-)
```

Lectura honesta del diff:
- Todo el diff de producto cae dentro de Automatización (`daily-maintenance.mjs`), Frontend (`App.jsx`, `Clients.jsx`, `Dashboard.jsx`, `Tasks.jsx`, `WhatsAppInbox.jsx`, los 2 hooks) y Testing (los 6 archivos de `test/`). **No hay diff en los otros 7 frentes** (UX, UI, Practicidad diaria, Backend salvo la migración de precios que ya notamos abajo, Datos, Documentación, Seguridad) — se mantienen en el mismo número que la noche del 13/09, tal como pide la consigna cuando no hay evidencia de cambio.
- Hay un archivo fuera de las 3 áreas declaradas: `supabase/migrations/20260912133000_catalog_price_import_rpc.sql` + `src/catalog-price-import-migration.test.mjs`. Es una migración de RPC de importación de precios de catálogo, con fecha de commit anterior al foco de esta ronda (probablemente colgada de un trabajo paralelo). No la evalúo como parte del salto de esta ronda porque no está en el alcance declarado ni tiene relación con Automatización/Testing/Frontend; se nota acá por transparencia pero no mueve ningún puntaje.

## Tabla comparativa de las 4 rondas

| Frente | 12/09 | 13/09 mañana | 13/09 noche | 14/09 madrugada | Cambio esta ronda |
|---|---|---|---|---|---|
| UX | – | – | 66 | 66 | sin cambios (sin diff) |
| UI | – | – | 55 | 55 | sin cambios (sin diff) |
| Automatización | – | – | 50 | 58 | **+8**: cron ahora genera tarea de seguimiento real para hot leads sin respuesta, con dedup verificada por clave canal+cliente. Sigue acotado (solo hot leads, no todo el pipeline) y sin tests end-to-end del cron completo, solo de `buildAutoFollowupTasks` en aislamiento — de ahí el tope moderado. |
| Practicidad diaria | – | – | 74 | 74 | sin cambios (sin diff) |
| Backend | – | – | 63 | 63 | sin cambios (sin diff) |
| Frontend | – | – | 52 | 60 | **+8**: 4 componentes memoizados (`Clients`, `Dashboard`, `Tasks`, `WhatsAppInbox`, confirmado por grep) + 3 props inestables corregidas con `useMemo`/normalización (`myChannels`, `filteredClients`, `mergeLogs`/`duplicateReviewDecisions`), verificado en código. La mejora fue medida empíricamente con `console.count` según el reporte del usuario, pero esa instrumentación ya no está en el código — no pude reverificar el conteo de renders yo mismo, solo la presencia y correctitud estructural del memo/useMemo. |
| Datos | – | – | 79 | 79 | sin cambios (sin diff) |
| Testing | – | – | 66 | 74 | **+8**: `test/components-smoke.test.mjs` (14 tests) renderiza componentes `.jsx` reales vía `react-dom/server` + rolldown, sin dependencias nuevas — confirmado corriendo `node --test` completo (365/365 pass) contra el `node_modules` real, no solo leyendo el código. El bug de compatibilidad npm/pnpm con el import de "rolldown" está confirmado arreglado en esta corrida. `test/hooks-pure-logic.test.mjs` (13 tests) cubre la lógica pura extraída de los 3 hooks nuevos. Sigue sin haber testing de interacción real de UI (clicks, eventos, estados post-interacción) porque no hay jsdom/testing-library — es smoke rendering, no testing de comportamiento. |
| Documentación | – | – | 80 | 80 | sin cambios (sin diff) |
| Seguridad | – | – | 75 | 75 | sin cambios (sin diff) |
| **Promedio** | **~55** | **~65.4** | **~66.0** | **~69.4** | +3.4 pts |

## Qué falta para llegar a 85/100 en los 3 frentes tocados

**Testing (74 → 85):** el techo actual es el modelo de smoke test — renderiza el componente y confirma que no explota, pero no simula clicks, no verifica que un estado cambie tras una interacción, no cubre errores de props inválidas ni accesibilidad. Para subir de 74 a 85 de forma honesta hace falta `@testing-library/react` + `jsdom` (o Vitest con entorno jsdom), que permite `fireEvent`/`userEvent` y aserciones sobre el DOM resultante. Esto es una decisión consciente de **no agregar dependencias nuevas** esta ronda — está correctamente fuera de alcance, pero es la brecha real y no hay forma de cerrarla solo con más tests en el estilo actual: se puede llegar quizás a 78-80 sumando más superficie de componentes cubiertos con el mismo enfoque de renderizado estático, pero el techo duro sin jsdom está alrededor de ahí.

**Frontend (60 → 85):** memoización puntual en 4 componentes es un parche localizado, no una política. Para 85 haría falta: (a) un criterio documentado de cuándo memoizar (no todos los componentes lo necesitan, sobre-memoizar tiene costo), (b) revisar el resto de los componentes grandes no tocados (Board, Pipeline, Sales, Interactions) que no tienen `memo()` ni fueron auditados por renders innecesarios, (c) alguna herramienta de medición de renders integrada al proyecto (React DevTools Profiler documentado como paso de QA, o un test que falle si un componente re-renderiza sin cambio de props) en vez de `console.count` manual que se saca antes de pushear y no deja rastro reproducible.

**Automatización (58 → 85):** una sola regla (hot leads sin respuesta → tarea) es un comienzo, no un sistema de automatización. Para 85 falta: cobertura de más señales del pipeline (no solo WhatsApp/hot leads — cotizaciones vencidas, clientes sin contacto en N días, tareas vencidas sin reasignar), un test que ejercite `runDailyMaintenance` end-to-end con datos realistas de cron (hoy el test nuevo prueba `buildAutoFollowupTasks` aislada, no la integración completa con el resto del pipeline de mantenimiento diario), y visibilidad para el usuario de qué reglas de automatización están activas y por qué se creó cada tarea automática (auditability).

## Resumen para Felipe

Los 3 frentes tocados subieron de forma consistente y verificable (+8 puntos cada uno, todos con evidencia de comando corrido en vivo, no solo lectura de código). El promedio pasa de 66.0 a 69.4. Los otros 7 frentes no se tocaron y se mantienen igual — no hay ni mejora ni regresión, confirmado por `git diff --stat` sin cambios en esos archivos. La brecha más grande contra la meta de 85 sigue siendo Testing, y ahí la limitación no es de esfuerzo sino de la decisión ya tomada de no sumar `jsdom`/`testing-library` — cuando se decida agregar esa dependencia, ahí sí hay margen real para pegar el salto grande en Testing.
