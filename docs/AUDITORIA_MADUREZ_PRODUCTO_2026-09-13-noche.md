# Auditoría de madurez del producto — 13/09 noche (tercera ronda)

Metodología idéntica a las dos rondas anteriores: evidencia real (leer código, correr
`node --test`, `npm run build`, greps concretos), misma vara, sin puntos por volumen
de trabajo. Foco escéptico en Frontend y Automatización, que es donde se hizo el
trabajo específico desde la ronda de esta mañana.

Comandos corridos en vivo para esta ronda:

```
node --test        → tests 328, pass 328, fail 0
npm run build       → vite build OK, 1913 módulos, sin errores
```

Commits nuevos desde la auditoría de la mañana (`4202137`):
`c61239c`, `95527d7`+`b0d0818` (señales del cron), `f78616c`+`32be294` (hooks + useCallback).
Diff acumulado: `api/cron-daily-maintenance.js`, `src/App.jsx`, `src/Dashboard.jsx`,
`src/daily-maintenance.mjs`, `src/hooks/{useWorkspaceSync,useSelectedRecords,useNavGroups}.js`,
`test/daily-maintenance.test.mjs`. Nada más tocado — no hay superficie de regresión oculta
en otros módulos.

## 1. Frontend: 40 → 52

**Lo que sí mejoró, verificado:**

- `App()` (la función, no el archivo) va de línea 189 a 1764: **1575 líneas de cuerpo**,
  bajando de las ~1778 previas. El archivo completo son 1765 líneas.
- `useState` dentro de `App()`: **9** (antes 21, confirmado por conteo). Los 12 restantes
  viven ahora en `useWorkspaceSync` (7), `useSelectedRecords` (3) y `useNavGroups` (1),
  fuera de `App()`.
- Los 3 hooks nuevos están bien diseñados, no son "el mismo código con `use` adelante":
  - `useWorkspaceSync` agrupa sesión + carga + guardado con debounce + tiempo real +
    readiness en una unidad con una sola responsabilidad conceptual (sincronización),
    devuelve una API mínima (`session`, `myChannels`, flags de estado, `retryLoad`,
    `retrySave`) sin filtrar setters internos sueltos.
  - `useSelectedRecords` y `useNavGroups` son deliberadamente chicos y de alcance
    acotado (selección de fichas abiertas; colapso de nav persistido); no intentan
    ser más de lo que son.
- Se agregaron 21 `useCallback` reales, no cosméticos: revisé los 21 uno por uno.
  No encontré ningún caso de deps vacías que debieran depender de algo (el bug que
  se pidió buscar explícitamente). El patrón dominante es `useCallback(fn, [data, ...])`
  para callbacks que leen `data` directamente antes de un `await confirm(...)` (necesitan
  `data` fresco en el momento del click, no en el de definición) y `useCallback(fn, [])`
  o `[session]` para los que usan `setData(current => ...)` funcional y no leen `data`
  de clausura. Ambos patrones son correctos para lo que hacen — no hay closures obsoletas.

**Por qué el subidón es más chico de lo que aparenta (el escepticismo pedido):**

- **Ningún componente en `src/` usa `React.memo`** (`grep -rn "memo(" src` → 0 resultados).
  Esto es clave: un `useCallback` solo evita reproceso cuando el componente que lo recibe
  está memoizado o el callback entra en el dep-array de otro hook interno. Como ni
  `Dashboard`, ni `Tasks`, ni `WhatsAppInbox`, ni `Clients` están memoizados, la mayoría de
  los 21 `useCallback` con deps `[data, ...]` se recrean en cada cambio de `data` de todos
  modos (que es casi cada acción del usuario) y no evitan ningún render de los hijos.
  El único beneficio real hoy es evitar recrear las funciones en renders donde `data`
  **no** cambia (p. ej. togglear el nav, escribir en un filtro) — beneficio real pero
  bastante más acotado que "21 handlers optimizados". Es trabajo correcto y con buena
  base para memoizar componentes después, pero **todavía no rinde su beneficio completo**
  porque falta el otro lado (`React.memo` en los hijos).
- **0% de cobertura de tests sobre componentes `.jsx`** sigue siendo cierto, y ahora
  hay más superficie sin cubrir: los 3 hooks nuevos (`useWorkspaceSync.js`,
  `useSelectedRecords.js`, `useNavGroups.js`) **no tienen ningún test propio** — ni
  siquiera unitario aislado de la lógica de merge/dedupe que `useWorkspaceSync`
  orquesta (esa lógica sí está testeada en `online.mjs`, pero el hook que la conecta
  a React —los efectos, el retry, el beforeunload— no). Es deuda nueva, no heredada.
- Virtualización de listas: sigue ausente (`grep -rln "react-window|react-virtual|FixedSizeList" src` → 0).
  Sin impacto visible hoy (bases de clientes/tareas siguen siendo chicas), pero no cambió.

**Veredicto:** la reducción de estado y la extracción de hooks es real y de buena calidad
de diseño, no cosmética. Los `useCallback` son correctos pero su beneficio de performance
está diferido hasta que se agregue `React.memo` en los componentes que los reciben — hoy
funcionan más como preparación que como optimización efectiva. +12 puntos, no los ~20 que
sugeriría "1778→1575 líneas + 21 useCallback" tomado a valor nominal.

## 2. Automatización: 44 → 50

**Confirmado con evidencia:**

- `dailySignals` no quedó muerto: `src/App.jsx:1544` lo pasa a `Dashboard`, y
  `src/Dashboard.jsx:282-285` lo consume con chequeo de frescura (`calculatedAt` de
  hoy) y fallback client-side (`buildRepurchaseRadar`, `findColdQuotes`,
  `findStaleHotLeads`) si el cron no corrió o los datos son viejos — diseño correcto,
  no hay riesgo de mostrar datos stale sin darse cuenta.
- El cron (`api/cron-daily-maintenance.js`) sigue iterando las filas de
  `workspace_states` vía `fetchWorkspaceRows` (`select=workspace_key,data` sobre
  todas las filas), aplica `buildFullDailyMaintenanceUpdate` por fila y persiste con
  `PATCH` solo si `changed` — mismo patrón que el cierre de tareas vencidas de antes,
  ahora extendido a calcular y guardar las 3 señales en `data.dailySignals`.
- Test dedicado (`test/daily-maintenance.test.mjs`) cubre el cálculo y la persistencia
  combinada de señales + cierre de tareas en una sola pasada — 328 tests totales pasan.
- **Sigue sin haber ningún envío a nadie afuera.** El comentario del propio archivo lo
  deja explícito ("por decisión de Felipe, alcance acotado a pisa propia, nunca manda
  mensajes/emails a nadie afuera"), y no hay ningún `fetch` nuevo hacia WhatsApp, email
  o servicios externos en el diff — los únicos `fetch` externos del repo
  (`mercadolibre-*.js`, `meta-onboarding.js`, `meta-subscribe.js`) son preexistentes y
  no relacionados con este cron.

**Por qué "44 a 50" y no más (precisión pedida sobre qué significa el número):**

- Esto es "el sistema calcula 3 métricas más, server-side y persistidas" — no "el
  sistema actúa solo". La automatización de negocio real (decidir escribirle a un lead
  caliente, decidir cuándo escalar una cotización fría, decidir cuándo ofrecer recompra)
  sigue siendo **100% manual**: `dailySignals` es una lista para que una persona la mire
  y decida, no un disparador de acción. No hay ninguna tarea, notificación push, ni
  mensaje generado automáticamente a partir de una señal — sólo aparecen en el Dashboard
  para que alguien las lea.
- El salto real de esta ronda es que antes (auditoría de la mañana) esas 3 señales sólo
  existían si alguien tenía la pestaña abierta client-side; ahora existen aunque nadie
  abra el CRM por varios días, lo cual es una mejora de confiabilidad de datos, no de
  autonomía del sistema. Vale puntos, pero no equipara a "automatización de negocio".
- Sigue sin haber ningún otro cron, webhook saliente, ni regla condicional que dispare
  una acción sin intervención humana. El único cron sigue siendo de mantenimiento
  interno de datos.

## 3. Los otros 8 frentes — chequeo de regresión (no re-investigación completa)

Todos corridos hoy contra el estado actual; ninguno cambió de número respecto a la
ronda de la mañana (13/09) porque ninguno de los archivos que tocan fue modificado en
los commits nuevos.

| Frente | Chequeo rápido corrido | Resultado |
|---|---|---|
| UX (66) | Sin cambios en componentes de flujo de usuario fuera de Dashboard/App ya cubiertos arriba | Sin regresión |
| UI (55) | `npm run build` sin warnings de CSS/assets nuevos | Sin regresión |
| Practicidad diaria (74) | Dashboard sigue mostrando señales con fallback; nav persistido intacto (`useNavGroups`) | Sin regresión, posible micro-mejora ya contada en Frontend |
| Backend (63) | `api/*.js` sin cambios salvo el cron ya evaluado | Sin regresión |
| Datos (79) | `test/workspace-sync.test.mjs` (23 tests) y `test/daily-maintenance.test.mjs` pasan completos | Sin regresión |
| Testing (68 → 66) | 328/328 verde, pero cobertura de `.jsx` sigue en 0% y ahora hay 3 hooks nuevos sin test — deuda nueva no compensada | Baja 2 puntos por deuda nueva no vista antes |
| Documentación (80) | Este documento + comentarios inline nuevos en cron y hooks son consistentes y explican el "por qué" (ver docstrings citadas arriba) | Sin regresión, comentarios de buena calidad |
| Seguridad (75) | `authorized()` en el cron sigue con fail-safe (`if (!secret) return false`), sin nuevas superficies de fetch externo, sin secretos hardcodeados en el diff | Sin regresión |

## Tabla resumen — mañana 13/09 → ahora (noche 13/09)

| Frente | 12/09 | 13/09 mañana | 13/09 noche | Δ mañana→noche |
|---|---|---|---|---|
| UX | 58 | 66 | 66 | 0 |
| UI | 42 | 55 | 55 | 0 |
| Automatización | 35 | 44 | 50 | **+6** |
| Practicidad diaria | 65 | 74 | 74 | 0 |
| Backend | 55 | 63 | 63 | 0 |
| Frontend | 28 | 40 | 52 | **+12** |
| Datos | 72 | 79 | 79 | 0 |
| Testing | 60 | 68 | 66 | **-2** |
| Documentación | 75 | 80 | 80 | 0 |
| Seguridad | 70 | 75 | 75 | 0 |
| **Promedio** | **~55.0%** | **~65.4%** | **~66.0%** | **+0.6** |

Promedio de las tres rondas: 12/09 ≈ 55.0% → 13/09 mañana ≈ 65.4% → 13/09 noche ≈ 66.0%.

## ¿Se está desacelerando el ritmo?

Sí, claramente, y es lo esperable. La primera ronda (12/09 → 13/09 mañana) subió el
promedio **+10.4 puntos** en un solo día, tocando prácticamente los 10 frentes a la vez
(fue una sesión de trabajo amplia). Esta segunda ronda (13/09 mañana → noche) subió
**+0.6 puntos** en el promedio, con trabajo dirigido y explícito a los dos gaps más
grandes identificados — y aun así el promedio casi no se movió, porque:

1. Solo 2 de 10 frentes tuvieron cambios reales (Automatización, Frontend), y los otros
   8 no se tocaron — matemáticamente, mover 2 de 10 frentes tiene un techo bajo sobre el
   promedio total aunque cada uno suba bastante en términos relativos.
2. Dentro de esos 2 frentes, la mejora relativa también se desaceleró: Frontend subió
   28→40 (+12) en la primera ronda y 40→52 (+12) en esta — mismo delta absoluto, pero la
   base es más alta, así que cuesta más trabajo por punto (los `useState` restantes y los
   componentes sin tests son más difíciles de resolver que la extracción inicial).
   Automatización subió 35→44 (+9) y ahora 44→50 (+6) — desacelerando en términos absolutos.
3. Un frente bajó (Testing, -2) por deuda nueva sin cubrir, lo cual es exactamente el tipo
   de efecto que aparece cuando se prioriza volumen de features sobre cobertura — señal de
   que el ritmo de "features nuevas" está empezando a generar fricción con "calidad
   sostenida", más que de que el equipo se esté quedando sin ritmo.

Conclusión: el ritmo de mejora general se está desacelerando (ley de rendimientos
decrecientes esperable después de una sesión de refactor grande), y además el trabajo
dirigido a gaps puntuales tiene rendimientos marginales decrecientes dentro del propio
gap. Esto no es alarmante — es lo normal después de resolver la fruta más baja — pero
significa que las próximas rondas van a necesitar trabajo más profundo (tests de
componentes, `React.memo`, automatización que dispare acciones) para seguir moviendo la
aguja al mismo ritmo.

## Gaps más grandes por frente que no llega a 90

### UX (66)
1. Sin research de usuario formal ni métricas de uso reales (tiempo en tarea, tasa de error).
2. Flujos de confirmación (`confirm()`) siguen siendo modales bloqueantes genéricos, no
   contextuales por tipo de acción.
3. No hay onboarding ni tour para usuarios nuevos del CRM.
4. Accesibilidad (foco, lectores de pantalla) no auditada formalmente.

### UI (55)
1. Sin sistema de diseño formal ni tokens documentados (colores/espaciados hardcodeados
   por componente).
2. Sin modo oscuro.
3. Responsive no verificado sistemáticamente en breakpoints móviles.
4. Iconografía y estados de carga inconsistentes entre paneles.

### Automatización (50)
1. Las señales de negocio (`dailySignals`) no disparan ninguna acción — 100% de "mirar y
   decidir" manual, cero "el sistema actúa o sugiere la próxima acción concreta".
2. No hay ningún otro cron además del de mantenimiento diario (sin recordatorios
   automáticos, sin re-priorización de tareas por SLA vencido más allá del cierre simple).
3. Sin integración saliente a WhatsApp/email para respuestas semi-automáticas (decisión
   consciente de Felipe, pero sigue siendo un gap frente al techo de 90).
4. Sin ningún tipo de scoring o clasificación por ML/reglas más allá de las heurísticas
   simples ya existentes (hot leads, cold quotes, repurchase).

### Practicidad diaria (74)
1. Sin atajos de teclado documentados para acciones frecuentes.
2. Sin bandeja unificada de notificaciones (todo vive dentro del Dashboard).
3. Exportación de datos limitada (no hay export masivo consistente en todos los módulos).

### Backend (63)
1. Sin capa de logging/observabilidad centralizada (errores del cron solo van a
   `console.error`, sin alerta).
2. Sin rate limiting ni validación de payload exhaustiva en los endpoints `api/*.js`.
3. Sin tests de integración contra Supabase real (solo unitarios de lógica pura).
4. Falta de reintentos/backoff en `saveWorkspaceRow` si falla el PATCH.

### Frontend (52)
1. Cero `React.memo` — los 21 `useCallback` nuevos no rinden su beneficio completo hasta
   que se memoicen los componentes que los reciben.
2. 0% de cobertura de tests sobre componentes `.jsx` (incluidos los 3 hooks nuevos).
3. Sin virtualización de listas (no es urgente hoy, pero no escala).
4. `App()` todavía tiene 9 `useState` y funciones de guardado inline no extraídas
   (`saveOpportunity`, `saveBoardList`, etc. siguen viviendo dentro de `App()` sin
   `useCallback` ni extracción a hook).
5. Sin lazy loading / code splitting de rutas (todo el bundle de 473 KB entra en un
   solo `index-*.js`, más el worker de PDF de 1.26 MB).

### Datos (79)
1. Sin migraciones versionadas formales (esquema de `workspace_states` evoluciona por
   convención, no por migration files).
2. Sin backups automatizados verificables documentados.
3. Falta validación de esquema (tipo Zod) sobre `data` antes de persistir.

### Testing (66)
1. 0% de cobertura sobre componentes `.jsx` — el problema más grande y más viejo,
   ahora agravado por 3 hooks nuevos sin test.
2. Sin tests end-to-end (Playwright/Cypress) del flujo completo de usuario.
3. Sin test de regresión visual.
4. Sin CI configurado explícitamente para correr `node --test` + `npm run build` en cada PR
   (no verificado en este repo si existe un workflow — no se encontró `.github/workflows`
   en el diff auditado).

### Documentación (80)
1. Sin documentación de arquitectura de alto nivel (diagrama de módulos/flujo de datos).
2. Sin guía de onboarding para un desarrollador nuevo.
3. READMEs de módulos individuales (hooks, api) inexistentes — el contexto vive en
   comentarios inline, que son buenos pero dispersos.

### Seguridad (75)
1. Sin rotación documentada de `CRON_SECRET` / claves de Supabase.
2. Sin rate limiting en endpoints públicos (`api/*.js`).
3. Sin auditoría de dependencias automatizada (`npm audit` no verificado en este repo).
4. Sin 2FA obligatorio a nivel de Supabase Auth (no confirmado en este chequeo).
