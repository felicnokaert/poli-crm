# Auditoría de madurez de producto — 2026-09-14 noche (sexta ronda)

Metodología: misma vara que las cinco rondas anteriores. Evidencia real ejecutada en este worktree (`node --import ./test/setup-dom.mjs --test`, `npm run build`, greps concretos y lectura de código) — no impresión general, no puntos por volumen de commits, y escepticismo activo sobre cada afirmación de commit (ronda 5 encontró un commit que afirmaba "verificado" sin estarlo; esta ronda repite ese chequeo sobre cada commit nuevo).

## 1. Comandos base ejecutados en vivo

```
node --import ./test/setup-dom.mjs --test
→ tests 397, suites 8, pass 397, fail 0, duration ~11.7s
```
397/397 en verde (vs. 389 en la ronda 5: +8 tests nuevos).

```
npm run build
```
Build OK en 481ms, **sin warning de chunk >500kB** (el warning que existía en las 5 rondas anteriores). Bundle principal `index-*.js`: **436.28 kB** (antes 473 kB). Chunks separados confirmados en el output real: `Sales-CIOVGgQB.js` (26.50 kB), `MercadoLibre-MXAq48nO.js` (3.91 kB), `TechnicalDocuments-CSz6bAl1.js` (16.22 kB), `DataSettings-Bk4zInf2.js` (30.76 kB) — los 4 componentes prometidos, cada uno en su propio archivo, ninguno dentro del bundle principal.

## 2. UI — verificación del fix de la regresión de ronda 5

```
node --import ./test/setup-dom.mjs --test test/css-tokens.test.mjs
→ 2/2 pass: "toda variable CSS usada con var(--x) está definida" y
  ":root define al menos los tokens de color básicos que la app depende"
```

Verificación manual adicional (no solo confiar en el test nuevo):
- `comm -23` entre variables `var(--x)` usadas y `--x:` definidas en `src/styles.css` → **vacío**, cero huérfanas (antes: 38 sin definir).
- `font-family: 'DM Sans', sans-serif`, `color: #282828`, `background: #f5f5f6` → de vuelta en `:root` (línea 3-6).
- `--brand-red`, `--brand-red-dark`, `--brand-charcoal`, `--brand-gray` → los 4 definidos de nuevo (línea 8-11), incluido el outline de foco por teclado que dependía de `--brand-red`.
- 45 custom properties definidas en total (antes: 5).

El fix no es un parche puntual: viene acompañado de un test permanente (`test/css-tokens.test.mjs`) que falla si el mismo tipo de regresión (var() sin definición) vuelve a introducirse — eso es una red de seguridad real, exactamente el tipo de mecanismo que faltaba en ronda 5 para que el bug pasara desapercibido.

**UI vuelve a subir por sobre el punto de partida de ronda 5** (70, antes de la regresión) más un incremento por la red de seguridad nueva que la ronda 5 no tenía.

## 3. Backend — 2 fixes de seguridad + resiliencia por fila

```
grep -n "encodeURIComponent" api/meta-onboarding.js
→ línea 46: fetch(`.../${encodeURIComponent(wabaId)}/subscribed_apps`...)
```
Confirmado, y además hay un `META_ID_PATTERN = /^\d{5,32}$/` que valida la forma del ID *antes* de llegar al encode — defensa en profundidad real, no solo el encode.

```
grep -n "MERCADOLIBRE_ACCOUNTS" api/mercadolibre-sync.js
→ línea 66: if (!MERCADOLIBRE_ACCOUNTS[accountKey]) return response.status(400)...
```
Confirmado: whitelist contra el objeto de cuentas conocidas antes de usar `accountKey` en cualquier query.

Lectura completa de `api/cron-daily-maintenance.js`: la resiliencia por fila es real, no cosmética. Hay dos niveles diferenciados a propósito:
- `fetchWorkspaceRows` (el único paso que, si falla, no deja nada para procesar) sigue abortando con 500 si falla — decisión correcta, documentada en un comentario que explica por qué ahí sí amerita abortar.
- El `for (const row of rows)` envuelve **cada fila individualmente** en su propio try/catch (línea 99-108), acumula `results` por workspace y nunca deja que el error de una fila interrumpa el loop. Confirmado también por test (`cron-daily-maintenance-retry.test.mjs`: "a broken row does not stop the cron from processing the other workspaces" — pasa).

`docs/OPERACION_CRON.md` existe (44 líneas nuevas).

## 4. Automatización

```
grep -n "AUTO_COLD_QUOTE_TASK_SOURCE|AUTO_HOT_LEAD_TASK_SOURCE" src/daily-maintenance.mjs
```
Ambas constantes existen, cada una con su propio `openKeysBySource(...)` (línea 162-163) — dedup separada por fuente, no una sola bolsa compartida que podría confundir cotizaciones frías con hot leads.

```
grep -n "withRetry" src/MercadoLibre.jsx api/mercadolibre-accounts.js
```
Confirmado en ambos, con comentarios explícitos de por qué esas operaciones son seguras de reintentar (GET de solo lectura, o POST idempotente que upsertea sin crear duplicados) — y con la contraparte correcta: `connect` (que inicia un redirect OAuth) está deliberadamente **fuera** de `withRetry`, con la razón documentada in situ. Ese es el criterio de idempotencia pedido, aplicado con matiz, no un `withRetry` a ciegas sobre todo.

Resumen legible del cron: confirmado en el `summary.descripcion` de `api/cron-daily-maintenance.js` (línea 131), con conteos en español.

Indicador en el Dashboard: confirmado en `src/Dashboard.jsx` — "El sistema generó N tarea(s) automática(s) hoy" / "El sistema no generó tareas automáticas hoy" (líneas 43 y 56).

## 5. UX

```
grep -n "Ver atajos de teclado|ShortcutsHelp" src/App.jsx
```
Botón con `aria-label="Ver atajos de teclado"`, estado `showShortcutsHelp`, componente `ShortcutsHelp` con su propio modal (línea 1794) — no es un tooltip disfrazado, es un panel real.

Empty state accionable en Empresas: `src/Clients.jsx` línea 255-256, dos mensajes distintos según haya filtros activos o cartera realmente vacía ("Todavía no cargaste ninguna empresa. Probá importar un CSV desde Datos → Importar clientes CSV.") — el segundo mensaje da una acción concreta, no un genérico "no hay resultados".

Tareas del cliente en su ficha: `src/ClientDetail.jsx` importa `TaskList` de `./Tasks` (línea 6) y lo usa (línea 474) — mismo componente que la vista central de tareas, no una lista paralela reimplementada.

## 6. Chequeo de escepticismo (igual que ronda 5 encontró un commit "verificado" que no lo estaba)

Se revisó cada commit nuevo contra evidencia, no contra su propio mensaje:
- `d127041` ("2 bugs reales, resiliencia por fila, doc operativo") → los 3 verificados arriba con grep/lectura directa, no solo el mensaje.
- `e6bb687` ("retry extendido, auto-followup cotizaciones frías, resumen auditable") → verificado con grep + lectura de `daily-maintenance.mjs` (dedup separada real) y el resumen en el handler.
- `f4028ef` ("ayuda de atajos, empty state accionable, tareas en ficha") → los 3 verificados con grep/lectura directa arriba.
- `e3fe42d` ("code splitting real") → confirmado con el output completo de `npm run build`, no solo con `React.lazy` en el código (que también podría no estar conectado a un `Suspense` real o no generar chunk separado — se verificó el chunk separado en el build, que es la prueba que realmente importa).
- `d83b6cd` ("test: red de seguridad contra variables CSS sin definir") → corrido explícitamente, pasa, y se hizo una verificación independiente (`comm -23`) para no depender solo del test que el mismo commit introduce.

Un hallazgo aparte, no de esta ronda de trabajo sino de higiene de repo: el commit `9509b57` usó `git add -A` y sin querer incluyó trabajo ajeno en curso (edición sin terminar de `docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md/.pdf` de otra sesión de Codex, y toda la carpeta `output/catalogo/`). Esto se detectó y revirtió correctamente en el commit siguiente (`d7b67ec`), sin borrar ni modificar nada en disco, solo destrackeando lo que no correspondía a esta sesión. No es una regresión funcional — es una señal de que `git add -A` en un repo con trabajo paralelo de otra sesión es un riesgo real que ya se materializó una vez; vale la pena que las próximas rondas sigan usando `git add <archivos específicos>` en vez de `-A`.

No se encontró ningún caso nuevo de "afirmación de verificado sin evidencia real" en esta ronda — a diferencia de ronda 5, donde el commit de tokens de diseño sí tenía esa falla.

## 7. Alcance total y frentes no tocados

```
git diff --stat 00a71d5..HEAD -- api/ src/ test/ docs/OPERACION_CRON.md
```
30 archivos, +181/-115 en el código de producto (excluyendo el ruido ajeno de `output/catalogo/` y los .md/.pdf de Codex, ya revertidos). Archivos tocados: `api/cron-daily-maintenance.js`, `api/mercadolibre-accounts.js`, `api/mercadolibre-sync.js`, `api/meta-onboarding.js`, `docs/OPERACION_CRON.md`, `src/App.jsx`, `src/ClientDetail.jsx`, `src/Clients.jsx`, `src/Dashboard.jsx`, `src/MercadoLibre.jsx`, `src/daily-maintenance.mjs`, `src/styles.css`, más los tests correspondientes.

Ningún archivo de `TechnicalDocuments.jsx`, `Board.jsx`, `PriceMemory.jsx`, `Interactions.jsx`, `Pipeline.jsx`, ni de la capa de persistencia (`useWorkspaceSync`, `lib/mercadolibre.mjs` fuera del whitelist ya visto) aparece en el diff — consistente con que Practicidad diaria, Datos, Documentación y Seguridad (más allá de los 2 fixes puntuales ya sumados a Backend) no tuvieron cambios de código este round. `docs/` no tuvo cambios de contenido salvo `OPERACION_CRON.md` (nuevo, ya contado en Backend) y los propios archivos de auditoría.

## 8. Puntajes actualizados (0-100)

| Frente | R1 12/09 | R2 13/09 am | R3 13/09 noche | R4 14/09 madrugada | R5 14/09 tarde | **R6 14/09 noche** | Cambio R5→R6 |
|---|---|---|---|---|---|---|---|
| UX | 58 | 66 | 66 | 66 | 70 | **74** | +4 |
| UI | 42 | 55 | 55 | 55 | 40 (regresión) | **73** | +33 |
| Automatización | 35 | 44 | 50 | 58 | 66 | **74** | +8 |
| Practicidad diaria | 65 | 74 | 74 | 74 | 74 | **74** | 0 |
| Backend | 55 | 63 | 63 | 63 | 68 | **75** | +7 |
| Frontend | 28 | 40 | 52 | 60 | 71 | **77** | +6 |
| Datos | 72 | 79 | 79 | 79 | 79 | **79** | 0 |
| Testing | 60 | 68 | 66 | 74 | 80 | **82** | +2 |
| Documentación | 75 | 80 | 80 | 80 | 80 | **80** | 0 |
| Seguridad | 70 | 75 | 75 | 75 | 79 | **81** | +2 |
| **Promedio** | **~55.0** | **~65.4** | **~66.0** | **~69.4** | **~70.7** | **~76.9** | **+6.2** |

### Justificación de cada cambio

- **UI (40→73, +33):** la regresión real de ronda 5 está genuinamente resuelta, con verificación propia (no solo el test nuevo) y con una red de seguridad permanente contra la recaída. No llega a 85 porque un solo test de "todo var() tiene su definición" no cubre contraste de color, tipografía responsiva, ni una revisión visual sistemática de todos los estados (hover/focus/disabled) — sigue siendo una app funcional visualmente correcta, no una con un sistema de diseño auditado a fondo.
- **Backend (68→75, +7):** 2 bugs de seguridad reales cerrados con defensa en profundidad (whitelist + encode, patrón de forma + encode), resiliencia por fila con el matiz correcto (aborta solo donde no hay nada que procesar), doc operativo nuevo. Sigue sin llegar a 85 porque la cobertura de estos fixes es puntual (2 endpoints de los ~15 que existen en `api/`), no una auditoría sistemática de todos los endpoints por el mismo patrón de vulnerabilidad.
- **Automatización (66→74, +8):** dedup separada por fuente (hot lead vs. cotización fría) verificada en código, retry con criterio de idempotencia explícito y documentado (no aplicado a ciegas), resumen legible + indicador visible en Dashboard — cierra el círculo de "el cron corre pero nadie se entera" que rondas anteriores dejaban abierto. Techo en 74 porque sigue siendo solo mantenimiento de datos propios (nunca manda mensajes salientes, por decisión de producto) y el cron en sí no tiene monitoreo/alertas si falla 2 días seguidos.
- **UX (70→74, +4):** mejora incremental real (panel de ayuda real, no tooltip; empty state con acción concreta; tareas de cliente reutilizando el componente central). No es transformador porque sigue siendo trabajo disperso en 3 puntos puntuales, no una revisión de flujo end-to-end.
- **Frontend (71→77, +6):** code splitting real confirmado en el build (bundle -37kB, chunks separados, warning de tamaño desaparecido) — es la primera vez en las 6 rondas que ese warning no aparece. Techo en 77 porque el bundle de `pdf.worker.min` (1.26MB) y `pdf-text` (430kB) siguen siendo enormes y no se tocaron; el code splitting resolvió el chunk que generaba warning pero no el peso total de la app.
- **Testing (80→82, +2):** 8 tests nuevos, incluido el test de resiliencia por fila del cron con un caso explícito de "fila rota no tira las demás abajo" — cobertura dirigida al cambio real, no solo cantidad. Cerca del techo: para superar 85 haría falta cobertura de UI con Testing Library sobre los flujos nuevos de esta ronda (ShortcutsHelp, empty state de Clientes) y no solo sobre lógica pura/backend.
- **Seguridad (79→81, +2):** 2 vulnerabilidades reales cerradas (URL injection por falta de encode, falta de whitelist) con test o verificación directa. No llega más alto porque sigue sin haber una auditoría sistemática de todos los endpoints de `api/` contra la misma clase de bug (solo se tocaron los 2 reportados), y no hay rate limiting ni CSP mencionados en ninguna ronda hasta ahora.
- **Practicidad diaria / Datos / Documentación (sin cambio):** confirmado por `git diff --stat` que no hubo cambios de código en estos frentes desde ronda 5 — se mantienen exactamente en su valor anterior, sin inflar ni descontar por inactividad.

## 9. ¿Qué tan cerca está el conjunto de la meta de 80-85%?

**Promedio general: ~76.9%.** Subió +6.2 puntos en esta ronda (contra +1.3 de la ronda 5→6 anterior si se excluye el efecto de la regresión de UI), impulsado sobre todo por la resolución completa y verificada del bug de UI (+33 en ese frente solo).

**Ningún frente individual cruzó todavía 85.** El más cercano es Testing (82) y Seguridad (81), seguidos de Backend (75), Automatización (74) y UX (74). Los que siguen más lejos de la meta son Practicidad diaria (74), Datos (79) — que llevan 3 rondas sin trabajo dedicado — y sobre todo los que dependen de decisiones de alcance de producto (Automatización, tope 74 mientras el cron no mande nada afuera; eso es una decisión deliberada de Felipe, no una limitación técnica).

**Qué falta específicamente en cada frente por debajo de 80:**
- **UX (74):** falta una revisión de flujo end-to-end (no solo puntos aislados) y accesibilidad de teclado más allá de los atajos ya agregados.
- **UI (73):** falta pasar de "sin var() huérfanas" a una revisión sistemática de contraste, estados de foco/hover en todos los componentes, y un test visual (screenshot diff) en CI que hubiera atrapado la regresión de ronda 5 automáticamente en vez de por auditoría manual.
- **Automatización (74):** falta monitoreo/alertas si el cron falla repetidamente (hoy el log queda en la consola de Vercel, nadie se entera activamente), y ampliar el alcance más allá de mantenimiento server-side propio (decisión de producto pendiente, no técnica).
- **Backend (75):** falta extender la whitelist/encode/validación de payload sistemáticamente a los ~13 endpoints de `api/` que no se tocaron esta ronda (se arregló donde se encontró el bug, no se auditó todo `api/` con la misma vara).
- **Frontend (77):** falta reducir el peso de `pdf.worker.min` (1.26MB) y `pdf-text` (430kB), que siguen siendo los 2 chunks más pesados del build por lejos.

**Ya cruzaron o están sobre 80:** Testing (82) y Documentación (80) — Documentación se mantiene ahí desde ronda 2 sin retroceder, y Testing acaba de cruzarlo también en esta ronda con 397 tests verdes reales (jsdom, no smoke).

**Conclusión:** el conjunto sigue por debajo de la meta de 80-85% (~76.9% de promedio), pero la brecha se cerró más en esta ronda que en cualquiera de las anteriores desde la ronda 2, principalmente porque el trabajo de esta vez incluyó tanto arreglar un problema real y verificado (UI) como extender con criterio (no a ciegas) mejoras ya empezadas (retry con idempotencia explícita, dedup separada). Si las próximas 2-3 rondas repiten este patrón — sobre todo llevando Backend y Seguridad a una auditoría sistemática de *todo* `api/` en vez de los 2 endpoints puntuales encontrados, y agregando testing de interacción de UI sobre los componentes nuevos de esta ronda — el conjunto cruzaría 80% de promedio general en 2-3 rondas más, con varios frentes individuales ya sobre 85.
