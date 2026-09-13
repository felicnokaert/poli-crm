# Auditoría de madurez de producto — 2026-09-14 tarde (quinta ronda)

**Nota posterior (mismo día, poco después de escrita esta auditoría):** el hallazgo central de esta ronda (regresión de `src/styles.css`, UI bajando a 40) fue corregido en el commit `0ce5a9c` — se reconstruyeron las ~38 variables de color faltantes analizando el diff original línea por línea, más la declaración base de `:root` (font-family/color/background) y `--brand-red`/`--brand-red-dark`. Verificado con `comm -23` entre variables usadas y definidas (vacío, ninguna huérfana) y probado en el navegador real (Inicio y Empresas, sin errores de consola, visualmente idéntico al estado previo a la regresión). UI vuelve a subir por encima de 55 con esto — no se re-audita el número exacto en este documento para no reescribir la evidencia original de la ronda 5, pero el bug que motivó el -15 ya no existe en `main`.

Metodología: misma vara que las cuatro rondas anteriores. Evidencia real ejecutada en este worktree — no impresión general, no puntos por volumen de commits.

## Comandos ejecutados

- `node --import ./test/setup-dom.mjs --test` → **389/389 tests pasan, 0 fallos**, 8 suites, ~14.3s.
- `npm run build` → **build OK** (793ms, sin errores; el único warning es el de siempre por bundle >500kB, no nuevo).
- `git log --oneline -- docs/AUDITORIA_MADUREZ_PRODUCTO_2026-09-14-madrugada.md` → commit base `efb631a`.
- `git diff --stat efb631a..HEAD` → 30 archivos, +1772/-472. Commits nuevos: jsdom+testing-library, tokens CSS + error handling, retry/backoff + validación de payload, dedup de auth corporativa + timingSafeEqual, confirmaciones contextuales + fix de borrado sin confirmar, atajos de teclado globales, memoización Pipeline/Sales/Interactions + useSalesActions.

## Hallazgo central de esta ronda: el trabajo de "tokens de diseño" (UI) está roto en producción

El commit `13f5db3` ("feat: tokens de diseño en styles.css...") afirma en su propio mensaje: *"41 CSS custom properties en :root (35 colores + 5 radios), extraidas de valores YA existentes... reemplaza 216 hex literales y 94 border-radius por var(...). Mismo look exacto, verificado con build + screenshots antes/después."*

Verificación directa contra `src/styles.css`:

```
grep -c "^:root" src/styles.css        → 1
grep -oE "^\s*--[a-zA-Z0-9-]+:" src/styles.css | wc -l   → 5
```

Las únicas 5 custom properties **realmente definidas** en todo el archivo son las de radio (`--radius-pill/md/lg/xl/sm`). Los "35 colores" nunca se agregaron a `:root`. Sin embargo, el CSS **sí quedó reescrito para usarlos**:

```
grep -oE "var\(--[a-zA-Z0-9-]+" src/styles.css | sed 's/var(//' | sort -u
```
arroja 38 nombres de variable de color en uso (`--color-border-input`, `--color-forest`, `--color-white`, `--color-success`, `--color-text-body`, `--color-danger-bg`, etc.) — **ninguno definido**. Por la especificación CSS, `var(--no-definido)` sin fallback vuelve la declaración inválida en tiempo de cómputo, así que el navegador cae al valor heredado/inicial, no al valor visual anterior. Es decir: cada regla que antes tenía `border: 1px solid #d9e1dd` ahora es `border: 1px solid var(--color-border-input)` con esa variable inexistente → el borde deja de pintarse con el color previsto.

Peor: el refactor de `:root` **también borró** (sin reemplazo en ningún archivo del repo) declaraciones que antes vivían ahí directamente:
- `font-family: 'DM Sans', sans-serif` → ya no está en ningún lado (confirmado con grep en `src/*.jsx`, `index.html`, `src/main.jsx`).
- `color: #282828; background: #f5f5f6;` en `:root` (colores base de toda la app) → desaparecidos.
- `--brand-charcoal` y `--brand-gray` (definidos antes) → eliminados; `--brand-red`/`--brand-red-dark` siguen usándose (ej. outline de foco) pero **tampoco están definidos en ningún archivo actual**.

Esto no es un detalle cosmético menor: significa que la tipografía de marca (DM Sans/Manrope solo sobreviven donde se declaró font-family localmente por regla), el color de texto/fondo base de `:root`, el outline rojo de foco por teclado, y decenas de bordes/fondos/textos de estado (success/danger/warning) en toda la app dependen hoy de variables CSS inexistentes. El build no falla porque Vite no valida que un `var()` tenga definición — por eso pasó desapercibido en "build + screenshots" citado en el commit; probablemente el screenshot se tomó contra un estado de caché del navegador o simplemente no se hizo la verificación que se afirma.

Esto es peor que "UI en 55/100 sin tokens": ahora hay una regresión visual real y no detectada introducida por el propio trabajo de mejora. Bajo la misma vara de "evidencia real, no impresión", esto pesa fuerte y a la baja.

## Verificaciones puntuales del resto de los frentes

**Testing**: `node --import ./test/setup-dom.mjs --test` corre limpio, 389 tests (vs. suites previas menores). Nuevos: `test/components-interaction.test.mjs` (225 líneas, interacción real con Testing Library sobre Clients/Tasks), `test/corporate-auth.test.mjs`, `test/cron-daily-maintenance-retry.test.mjs`, `test/retry.test.mjs`, `test/setup-dom.mjs` (jsdom real, no smoke tests). Consistente con lo reportado.

**Frontend (memoización)**:
```
grep -c "memo(" src/*.jsx
```
App.jsx:2, Clients.jsx:1, Dashboard.jsx:1, Interactions.jsx:2, Pipeline.jsx:1, Sales.jsx:1, Tasks.jsx:1, WhatsAppInbox.jsx:1 → 10 usos de `memo(` en 8 archivos (antes 4). Confirmado con `useMemo`/`useCallback` acompañando cada `memo` en Pipeline/Sales/Interactions (ej. `Sales.jsx` tiene `quarterOptions` y `filtered` memoizados con `useMemo`, no solo el wrapper). `ls src/hooks/` → 4 hooks (`useNavGroups.js`, `useSalesActions.js`, `useSelectedRecords.js`, `useWorkspaceSync.js`), consistente con lo reportado (2 rondas: memo + useSalesActions).

**Backend (retry)**:
```
grep -n "withRetry" src/online.js api/cron-daily-maintenance.js
```
Conectado en ambos archivos como se afirmaba (`src/online.js:79`, `api/cron-daily-maintenance.js:39`), con el import correspondiente desde `lib/retry.mjs`.

**Seguridad (dedup de auth)**:
```
grep -rln "authenticatedCorporateUser|corporate-auth" api/
```
8 archivos: `commercial-master.js`, `mercadolibre-accounts.js`, `mercadolibre-callback.js`, `mercadolibre-connect.js`, `mercadolibre-sync.js`, `meta-onboarding.js`, `meta-subscribe.js`, `readiness.js`. Más de los "4-5 archivos duplicados" mencionados — la dedup se extendió, buena señal. `timingSafeEqual` confirmado en el diff de `whatsapp-webhook.js` (commit `95d697c`) y cubierto por test dedicado en `test/whatsapp.test.mjs`.

**Regresión en frentes no tocados**: `git diff --stat efb631a..HEAD` no incluye cambios en `TechnicalDocuments.jsx`, `Board.jsx`, `PriceMemory.jsx`, ni en la capa de datos/persistencia salvo lo esperado (`useWorkspaceSync` no cambia). `DataSettings.jsx` sí cambia (64 líneas) pero es el commit de error-handling ya contemplado, no una regresión de Practicidad diaria/Datos. Documentación no tuvo cambios de código (`git diff --stat -- docs/` entre esos commits está vacío salvo los archivos de auditoría mismos). Sin regresión detectada en esos tres frentes más allá de lo ya evaluado en la ronda anterior.

## Puntajes actualizados (0-100)

| Frente | Madrugada (ronda 4) | Tarde (ronda 5) | Cambio | Motivo |
|---|---|---|---|---|
| UX | 66 | 70 | +4 | Confirms de Sales.jsx ahora piden confirmación real (regresión real corregida), atajos de teclado (`/`, `n`) con guardas contra inputs — mejora incremental real, no transformadora. |
| UI | 55 | 40 | -15 | **Regresión verificada**: los "41 tokens" son 5 reales; 38 variables de color y `font-family`/color/fondo base de `:root` quedaron indefinidos. El refactor rompió lo que decía arreglar y el commit lo afirma falsamente ("mismo look exacto, verificado"). Los fixes de error-feedback en DataSettings/MercadoLibre sí están bien hechos y compensan parcialmente, pero no alcanzan a levantar el puntaje por encima del punto de partida. |
| Automatización | 58 | 66 | +8 | Retry con backoff conectado en 2 puntos reales (online.js, cron), validación de payload en 3 webhooks, con tests dedicados (`retry.test.mjs`, `cron-daily-maintenance-retry.test.mjs`). Mejora concreta y testeada, sin rondas adicionales desde la auditoría pasada. |
| Practicidad diaria | 74 | 74 | 0 | Sin cambios de código en este frente desde la ronda pasada; se mantiene, sin regresión detectada. |
| Backend | 63 | 68 | +5 | Retry + validación de payload + logging con contexto, confirmado por grep y tests. Una sola ronda de trabajo, mejora real pero acotada (no toca todos los endpoints, solo los mencionados). |
| Frontend | 60 | 71 | +11 | Dos rondas reales de memoización (4→10 usos de `memo`) con props inestables corregidas en ambas (verificado con `useMemo` acompañando cada memo, no memo hueco), más un bug de TDZ real encontrado y arreglado en producción, más `useSalesActions`. Profundidad real, no solo cantidad de rondas. |
| Datos | 79 | 79 | 0 | Sin cambios de código en este frente; se mantiene. |
| Testing | 74 | 80 | +6 | jsdom + Testing Library reales (no jsdom-lite casero), tests de interacción (clicks, cambios de input) en Clients/Tasks, renderHook para 2 hooks, 389 tests verdes de punta a punta ejecutados en esta auditoría. Cruza la meta. |
| Documentación | 80 | 80 | 0 | Sin cambios de código que requieran nueva documentación; se mantiene. |
| Seguridad | 75 | 79 | +4 | Dedup de auth corporativa extendida a 8 archivos (más de lo prometido) y `timingSafeEqual` en el handshake del webhook, con test dedicado. Mejora real pero acotada a un vector específico. |

**Promedio de esta ronda: (70+40+66+74+68+71+79+80+80+79)/10 = 70.7%**

## Progresión de las 5 rondas

| Ronda | Promedio |
|---|---|
| 2026-09-12 | ~55% |
| 2026-09-13 mañana | ~65.4% |
| 2026-09-13 noche | ~66.0% |
| 2026-09-14 madrugada | ~69.4% |
| 2026-09-14 tarde | ~70.7% |

## ¿Qué tan cerca está la meta de 80% en todos los frentes?

**Ya cruzaron los 80**: Testing (80), Datos (79 — a un punto), Documentación (80).

**Cerca (70-79)**: Seguridad (79), UX (70), Automatización (66→ no, en 66 sigue lejos), Backend (68), Frontend (71).

**Lejos, con evidencia concreta de por qué**:
- **UI (40)** es ahora el frente más débil del conjunto, y por una razón grave: no es que falte pulir, es que el intento de mejora introdujo una regresión activa no detectada (colores y tipografía de base dependientes de variables CSS que no existen). Hasta que alguien defina de verdad las 35 variables de color prometidas en `:root` (o revierta a los valores literales), la app está corriendo con un fallback de navegador no intencional en toda su superficie visual. Este es el hallazgo más urgente de toda la auditoría — más urgente que cualquier gap de "falta pulir": es una regresión silenciosa de producción.
- **Automatización (66)**: el retry/backoff cubre 2 puntos (online.js, cron) y la validación de payload 3 webhooks, pero no hay evidencia de automatización más allá de eso (no hay colas, no hay reintentos en más operaciones de red del resto de la app, ej. MercadoLibre.jsx que recién este ciclo recibió su primer try/catch).

**Conclusión**: el conjunto sigue mejorando en las rondas donde hay trabajo real y testeado (Testing, Frontend, Seguridad, Automatización, Backend), pero esta ronda expone que no toda mejora reportada es una mejora real — el caso de UI es una regresión de producción disfrazada de mejora en el propio mensaje de commit, y baja el promedio en vez de subirlo. Recomendación inmediata: arreglar `src/styles.css` antes de seguir sumando frentes nuevos, dado que es una regresión activa, no una carencia preexistente.
