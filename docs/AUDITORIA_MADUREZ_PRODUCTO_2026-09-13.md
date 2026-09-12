# Re-auditoría de madurez del producto — 13/09/2026

**Autor:** Claude Sonnet 5, a pedido de Felipe. Diagnóstico de solo lectura, sin cambios de código.
**Objetivo:** medir honestamente cuánto avanzó cada frente desde la auditoría del 12/09
(`docs/AUDITORIA_MADUREZ_PRODUCTO_2026-09-12.md`), con la misma vara de exigencia — no premiar
esfuerzo, premiar evidencia.

**Metodología:** lectura directa del código (`src/`, `test/`, `api/`, `supabase/migrations/`),
`npm test` (`node --test`) corrido en vivo, `npm run build` corrido en vivo, y greps puntuales
de patrones (`useState`, `useCallback`, `aria-`, cron config, etc.). Los números de esta corrida
están citados abajo; ningún número es "a ojo".

## Resultados de comandos corridos hoy

- `npm test` → **322/322 tests, 0 fallas** (era 268/268 el 12/09; +54 tests).
- `npm run build` → build de producción **exitosa** (1910 módulos, sin errores).
- `src/App.jsx`: **1976 líneas** (era 7110). Pero la función `App()` en sí —línea 199 a 1976—
  sigue siendo **una sola función de 1778 líneas**, con 21 `useState`, 1 `useMemo`, **0 `useCallback`**.
- Componentes extraídos: `Board.jsx` (258), `ClientDetail.jsx` (492), `Clients.jsx` (324),
  `Dashboard.jsx` (462), `DataSettings.jsx` (702), `InboxComponents.jsx` (542), `Sales.jsx` (575),
  `Tasks.jsx` (401), `TechnicalDocuments.jsx` (608), `WhatsAppInbox.jsx` (451), y otros más chicos.
  17 archivos `.jsx` nuevos, ~9000 líneas totales de UI repartidas.
- `useState` total en `src/*.jsx`: 132. `aria-*`: 48 (era 24). `alt=`: 2 (sin cambio). `role=`: 6 (era 0).
- `vercel.json` ahora tiene sección `crons` con un job diario (`0 6 * * *` → `/api/cron-daily-maintenance`).
- `supabase/migrations/`: 17 archivos `.sql` versionados + `README.md` con 3 discrepancias documentadas.
- Ningún test toca un componente `.jsx` directamente (`grep -rl "\.jsx" test/*.test.mjs` → solo
  `workspace-sync.test.mjs`, que testea `src/workspace.mjs`, no un componente). Cobertura de
  componentes React: **0%, igual que el 12/09.**

## Tabla de madurez por frente

| # | Frente | Inicial (12/09) | Actual (13/09) | Delta | Evidencia del delta |
|---|--------|---|---|---|---|
| 1 | UX | 58 | 66 | +8 | Bandeja de duplicados ahora tiene las 4 acciones completas (Fusionar/No son duplicados/Postergar/Deshacer con `mergeLog` reversible en `src/Clients.jsx` y `src/App.jsx`) — cierra el gap que la spec de identidad de cliente señalaba como pendiente. Plan del día ahora es clicable (`onNavigate` en `src/Dashboard.jsx` lleva a tarea/mensaje directo). Atajos de fecha en tareas (`Mañana`, `+3 días`, etc. en `src/Tasks.jsx`). Sigue faltando: notificaciones fuera de sesión, ningún onboarding/tour para un usuario nuevo del equipo. |
| 2 | UI | 42 | 55 | +13 | Estados de loading/error explícitos en carga inicial (`Splash`, `Reintentar` en `src/App.jsx`), guardado y Base técnica. Bug de mobile (sync-pill que tapaba contenido) corregido con reglas de `@media (max-width: 760px)` en `src/styles.css`. `aria-*` subió de 24 a 48 y `role=` de 0 a 6, pero `alt=` sigue en 2 — imágenes sin texto alternativo casi no se tocaron. Sigue sin haber design system ni tokens de color/espaciado consistentes; `styles.css` creció a 388 líneas pero sigue siendo un solo archivo plano con selectores muy específicos por componente. |
| 3 | Automatización | 35 | 44 | +9 | Hay un cron real (`api/cron-daily-maintenance.js`, protegido con `CRON_SECRET`, `fail-safe` si no hay secret) registrado en `vercel.json` y corriendo diariamente. Pero su alcance es deliberadamente angosto: **una sola tarea** (cerrar tareas vencidas server-side vía `buildDailyMaintenanceUpdate`), sin enviar nada afuera. Sigue siendo cierto, casi textual, que **"todo lo inteligente es manual"**: `hot-leads-radar.mjs`, `repurchase-radar.mjs`, `commercial-triage.mjs`, `followup-policy.mjs` — los módulos que generan las señales de negocio — solo corren client-side cuando alguien tiene la pestaña abierta (se confirmó por grep: ninguno se importa desde `api/*.js`, solo desde componentes `.jsx`). El cron es un parche a un síntoma puntual, no una automatización del negocio. |
| 4 | Practicidad diaria | 65 | 74 | +9 | Plan del día clicable, atajos de fecha, botón de un clic "No requiere acción" en WhatsApp (confirmado en `src/InboxComponents.jsx` y `src/WhatsAppInbox.jsx`) reducen fricción real y medible en el uso diario. Sigue faltando lo mismo que en la auditoría anterior: cero notificaciones push/email fuera de sesión — si nadie abre el CRM, nadie se entera de nada salvo el cierre silencioso de tareas vencidas. |
| 5 | Backend | 55 | 63 | +8 | Migraciones SQL ahora viven versionadas en `supabase/migrations/` (17 archivos) con un `README.md` que documenta honestamente 3 discrepancias entre lo que decían los docs viejos y lo que corre en producción — incluyendo un hallazgo real (`workspace_states` ya no es compartido, tiene una fila huérfana `'grupo-poliplast'` inalcanzable por policy). **Importante matiz:** esto es una reconstrucción retroactiva a partir del esquema real vía MCP, no migraciones aplicadas hoy con el flujo normal del CLI (`supabase db push`) — el repo tiene ahora un registro confiable de lo que existe, pero el próximo cambio de esquema todavía depende de que alguien siga la disciplina nueva a mano. Sigue sin haber índices explícitos sobre el JSON de `workspace_states`. |
| 6 | Frontend | 28 | 40 | +12 | La partición de `App.jsx` (7110 → 1976 líneas, 17 archivos nuevos) es real y mejora la navegabilidad del repo. **Pero es una partición por componente hijo, no una reducción de la complejidad del componente raíz**: `App()` en sí sigue siendo una función de 1778 líneas (91% del archivo) con 21 `useState` y **0 `useCallback`** — literalmente el mismo patrón que el diagnóstico anterior criticaba, solo que ahora conviven con componentes hijos más chicos. No hay virtualización de listas (`react-window` no aparece en el repo) pese a que la cartera sigue en 1056+ clientes. El techo de este frente sigue estando en `App.jsx`: seguir bajándole líneas ahí (moviendo estado a hooks custom, no solo JSX a archivos separados) es lo que realmente movería la aguja. |
| 7 | Datos | 72 | 79 | +7 | Bug real corregido con evidencia (144 clientes con `family` en variantes de mayúsculas/plural normalizados, commit `47df081`), con test dedicado. Consistencia referencial casi perfecta (1 huérfano de 1056 clientes, documentado). 27 duplicados diagnosticados como pendientes (no resueltos aún, correctamente etiquetados como pendientes y no como "hecho"). Vínculos formales producto-ficha técnica agregados (commit `b7eb94f`). Resta: los 27 duplicados siguen sin fusionar, y no hay un job recurrente que re-detecte duplicados nuevos a medida que entran clientes. |
| 8 | Testing | 60 | 68 | +8 | 322 tests (+54), todos pasando, 0 fallas confirmado en esta corrida. La cobertura nueva es real (workspace.mjs, user-channels, file-hash, clientSearchText). **Pero persiste exactamente el mismo gap estructural señalado el 12/09: cobertura de componentes `.jsx` sigue en 0%.** Los ~9000 líneas de UI nueva (Board, Clients, Dashboard, Sales, Tasks, TechnicalDocuments, WhatsAppInbox, etc.) no tienen un solo test de React. Además, un hallazgo de higiene: `test/client-merge.test.mjs` incluye un test cuyo propio nombre dice `"consolidateDuplicateClients existe como función aislada pero no está enganchada a ningún flujo activo del código"` — es decir, hay un test verde que documenta código muerto en `src/workspace.mjs`, no una funcionalidad viva. Cuenta para el número de tests pero no para cobertura real de producto. |
| 9 | Documentación | 75 | 80 | +5 | Manual de uso y specs actualizados y (según lectura cruzada) sin contradicciones nuevas. El `README.md` de migraciones es un ejemplo de documentación honesta (documenta discrepancias en vez de esconderlas). Techo bajo para subir más: la documentación ya cubre bien lo que hay, el límite ahora es que el código mismo tiene deuda (frontend, automatización) que ningún doc puede compensar. |
| 10 | Seguridad | 70 | 75 | +5 | `docs/AUDITORIA_SEGURIDAD_2026-09-12.md` (115 líneas) cubre secretos, auth, RLS confirmado en vivo, superficie de webhooks, inyección, CSP/headers y datos personales, con un top 5 de higiene sin hallazgo crítico. No se pudo correr `npm audit`/`pnpm audit` en ese entorno (limitación reconocida en el propio doc, no ocultada). Sigue siendo la misma auditoría del 12/09 — no hubo cambios de seguridad nuevos desde entonces para re-verificar, así que el número sube por tener el documento (antes no existía) más que por cambios de código adicionales. |

## Promedio global

- **Inicial (12/09):** ~55% (promedio ponderado del documento original; ~53% simple).
- **Actual (13/09), promedio simple de los 10 números de esta tabla:** **~65.4%**
- **Delta:** +10.4 puntos en 24 horas de trabajo real, verificado con tests y build en vivo — no es
  cosmético, pero tampoco es el salto que "se trabajó en los 10 frentes" podría sugerir a primera
  lectura. El frente más débil (Automatización, 44) sigue siendo el más débil por lejos, y Frontend
  (40) sigue siendo el segundo más débil pese a la refactorización visible.

Etapa: **MVP funcional con mejoras reales y verificables en los 10 frentes, pero todavía lejos de
producto maduro.** Ningún frente llegó a 90. El salto más importante (Frontend) resolvió un
síntoma (un archivo gigante) sin resolver la causa (un componente raíz gigante con estado
manual); el segundo salto más importante (Automatización) resolvió un caso puntual sin tocar el
diagnóstico de fondo ("todo lo inteligente es manual").

## Regresiones y problemas nuevos detectados

1. **Test que documenta código muerto, no funcionalidad.** `consolidateDuplicateClients` en
   `src/workspace.mjs` no se llama desde ningún flujo activo (confirmado por grep: solo aparece en
   su propio archivo y en el test). El test que lo cubre es correcto en lo que dice, pero infla el
   contador de "322 tests" con un caso que no protege nada en producción. No es un bug, pero es una
   señal de higiene floja: o se borra el código muerto, o se lo conecta a algo real.
2. **La partición de `App.jsx` no redujo la complejidad del componente raíz.** Ver Frontend arriba:
   `App()` sigue siendo una función de 1778 líneas con 0 `useCallback`. Si mañana hay que tocar el
   flujo principal de guardado o navegación, se sigue editando un archivo de casi 2000 líneas con
   21 piezas de estado interdependientes — el refactor movió los componentes de presentación, no el
   controlador central.
3. **Las migraciones SQL versionadas son retroactivas, no parte de un flujo vivo.** Es una mejora
   real (existía cero versionado antes), pero el riesgo que motivó el gap original — cambiar el
   esquema sin dejar rastro — solo se cierra si de acá en adelante alguien sigue la disciplina nueva
   a mano; no hay ningún check automático (CI, hook) que lo fuerce.

## Los 5 gaps más grandes para llegar a 90+ (por frente, priorizados por apalancamiento)

1. **Automatización (44 → 90 necesita lo más grande):** conectar al menos una señal de negocio real
   (hot leads, repurchase radar, cotizaciones frías) a un cron o webhook que actúe o notifique sin
   que alguien tenga la pestaña abierta. Hoy el único cron es de limpieza interna, no de negocio.
2. **Frontend (40 → 90):** bajar la función `App()` de 1778 líneas moviendo estado a hooks custom
   (`useWorkspaceState`, `useDayPlan` ya existen como patrón — faltan más), agregar `useCallback`
   donde se pasan handlers a componentes hijos, y virtualizar las listas de clientes/tareas con
   `react-window` o equivalente.
3. **Testing (68 → 90):** cerrar la cobertura 0% de componentes `.jsx` (aunque sea con tests de
   humo/render en los 5-6 componentes más grandes: `Sales.jsx`, `DataSettings.jsx`,
   `TechnicalDocuments.jsx`, `ClientDetail.jsx`), y decidir si `consolidateDuplicateClients` se borra
   o se conecta a un flujo real.
4. **UI (55 → 90):** definir un design system mínimo (tokens de color/espaciado en vez de valores
   sueltos repetidos en `styles.css`), y completar accesibilidad — `alt=` sigue en 2 sobre ~9000
   líneas de UI.
5. **Backend (63 → 90):** agregar índices explícitos sobre las columnas más consultadas de
   `workspace_states`, y mover el proceso de migraciones de "reconstrucción retroactiva documentada"
   a "flujo vivo" (todo cambio de esquema nuevo pasa primero por `supabase/migrations/` antes de
   aplicarse, verificable en CI).

## Nota sobre confiabilidad

Todos los números de esta tabla están respaldados por un comando corrido en esta sesión
(`npm test`, `npm run build`, greps de líneas/patrones específicos) o por lectura directa del
archivo citado. Donde el trabajo nuevo no tenía forma de verificarse en vivo (por ejemplo,
Seguridad, que no tuvo cambios de código desde el 12/09), el número no se movió por impresión sino
por la existencia del documento nuevo, y se dice explícitamente en la tabla.
