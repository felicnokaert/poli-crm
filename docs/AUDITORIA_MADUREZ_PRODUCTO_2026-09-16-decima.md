# Auditoría de madurez de producto — décima ronda (2026-09-16)

Metodología idéntica a las nueve rondas anteriores: evidencia real ejecutada en vivo (`node --import ./test/setup-dom.mjs --test`, `npm run build`), grep puntual sobre el código, y `git diff --stat` contra el commit de cierre de la novena ronda (`603939b`) para confirmar alcance.

A diferencia de las rondas 7-9 (foco en Backend/Testing/UX), esta ronda atacó específicamente los dos frentes que la novena auditoría había señalado como los de mejor relación costo/beneficio: **Automatización (74/100)** y **Practicidad diaria (76/100)**, con la condición explícita de no tocar Backend/Testing/UX/Frontend/Datos/Documentación/Seguridad.

## 1. Evidencia en vivo

```
node --import ./test/setup-dom.mjs --test
tests 445
suites 16
pass 445
fail 0
```

431 (cierre de la novena ronda) → 445: **+14 tests nuevos**, los tres suites agregados en esta ronda (`stale-clients-radar.test.mjs` con 8, `quoted-clients-radar.test.mjs` con 6). Sin regresión en ningún test preexistente.

```
npm run build
✓ 1977 modules transformed, built in 833ms
dist/assets/index-*.js   417.93 kB (antes 412.72 kB, +5.21 kB)
dist/assets/pdf.worker.min-*.mjs   1265.41 kB (sin cambio)
dist/assets/pdf-text-*.js           430.30 kB (sin cambio)
```

Build limpio, sin warnings. El crecimiento del bundle principal es marginal (+1.3%) y corresponde a los dos módulos de radar nuevos (`stale-clients-radar.mjs`, `quoted-clients-radar.mjs`), ambos lógica pura sin dependencias nuevas.

## 2. Alcance total confirmado (`git diff --stat` 9ª→10ª)

```
 src/App.jsx                        |  26 ++++++---
 src/ClientDetail.jsx               |  16 ++++++
 src/Dashboard.jsx                  |  84 +++++++++++++++++++++++++++-
 src/daily-maintenance.mjs          | 110 +++++++++++++++++++++++++++++++++++--
 src/quoted-clients-radar.mjs       |  56 +++++++++++++++++++
 src/stale-clients-radar.mjs        |  83 ++++++++++++++++++++++++++++
 test/daily-maintenance.test.mjs    |  20 +++++--
 test/quoted-clients-radar.test.mjs |  45 +++++++++++++++
 test/stale-clients-radar.test.mjs  |  62 +++++++++++++++++++++
 9 files changed, 484 insertions(+), 18 deletions(-)
```

9 archivos, exactamente los que corresponden a Automatización (`daily-maintenance.mjs`, `stale-clients-radar.mjs`, `quoted-clients-radar.mjs`) y Practicidad diaria (`App.jsx` badge, `ClientDetail.jsx` botón, `Dashboard.jsx` paneles). **Ningún archivo de Backend, Frontend, Datos, UX, UI, Documentación o Seguridad aparece en el diff** — confirma que esos 7 frentes no tuvieron cambio de código desde la novena ronda. Sus puntajes se mantienen sin modificación.

## 3. Verificación puntual de los 3 cambios trabajados

**Automatización — dos señales nuevas + auto-tareas (`daily-maintenance.mjs`, `stale-clients-radar.mjs`, `quoted-clients-radar.mjs`):**

El sistema pasó de generar auto-tareas para 2 señales (hot leads, cotizaciones frías por WhatsApp) a 4:

1. `findStaleClients` (`src/stale-clients-radar.mjs:1`): clientes con `outcome` "Abierto" (o sin fijar, el default) sin venta ni mensaje de WhatsApp en 30+ días. Criterio explícito y verificable: usa `client.outcome` (campo real ya existente en la ficha, no una suposición sobre la etapa del pipeline) y omite el cliente si no hay ninguna fecha de referencia real (nunca inventa un "días sin contacto").
2. `findExpiredQuotes` (`src/quoted-clients-radar.mjs:1`): clientes con `client.lastQuotedAt` (un timestamp que Felipe marca con un click, ver punto siguiente) de 15+ días sin venta después.

Ambas generan tarea de seguimiento automática con el mismo patrón anti-duplicado (`source` + `autoKey` estable) que ya usaban hot leads/cotizaciones frías desde la ronda de AUDITORIA_MADUREZ_PRODUCTO_2026-09-14-tarde.md. Confirmado en `src/daily-maintenance.mjs`: 4 constantes de `source` (`AUTO_HOT_LEAD_TASK_SOURCE`, `AUTO_COLD_QUOTE_TASK_SOURCE`, `AUTO_STALE_CLIENT_TASK_SOURCE`, `AUTO_EXPIRED_QUOTE_TASK_SOURCE`), cada una con su propio set de claves abiertas para evitar duplicados cruzados.

**Practicidad diaria — visibilidad de las señales sin abrir cada tarea (`App.jsx`, `Dashboard.jsx`):**

- `App.jsx:1404-1414`: el ícono "Por revisar" del sidebar ahora suma `hotLeadsCount + coldQuotesCount` de `dailySignals` (ya cacheado por el cron, sin recomputar nada extra client-side). Si la señal no está fresca (nadie abrió el CRM hoy), no muestra nada — mismo criterio de "sin confirmar antes que inventar" que el resto del sistema.
- `Dashboard.jsx`: se agregaron 2 paneles visuales nuevos ("Clientes sin contacto", "Cotizaciones vencidas"), ambos siguiendo el patrón visual ya existente de "Para reponer"/"Cotizaciones frías" (panel + candidato en el Plan de hoy + conteo en `AutomationSummary`). Confirmado en vivo en navegador con datos inyectados: el badge, el candidato del plan y el panel muestran el nombre de cuenta y los días correctos.

**Practicidad diaria — reducir el olvido real de Felipe sobre cuándo cotizó (`ClientDetail.jsx`):**

Botón "Marqué que coticé hoy" (`src/ClientDetail.jsx:105-119`) que guarda solo `client.lastQuotedAt` (un timestamp), sin adjuntar el presupuesto de Contabilium ni forzar un cambio de etapa del pipeline. Decisión de producto explícita de Felipe: adjuntar el presupuesto real sería tedioso y pesaría la base de datos sin necesidad — el timestamp alcanza para calcular "vencida". Verificado en vivo en navegador: el click actualiza la ficha de "Sin registrar" a la fecha del día sin recargar la página.

## 4. Tabla de las 10 rondas

| Ronda | UX | UI | Automat. | Practicidad | Backend | Frontend | Datos | Testing | Docs | Seguridad | Promedio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 58 | 62 | 40 | 50 | 55 | 60 | 52 | 45 | 48 | 50 | 52.0 |
| 2 | 65 | 68 | 52 | 60 | 64 | 67 | 61 | 58 | 60 | 62 | 61.7 |
| 3 | 70 | 72 | 60 | 66 | 70 | 72 | 68 | 68 | 68 | 70 | 68.4 |
| 4 | 73 | 74 | 65 | 70 | 73 | 75 | 72 | 74 | 73 | 75 | 72.4 |
| 5 | 74 | 76 | 68 | 72 | 75 | 77 | 75 | 78 | 77 | 78 | 75.0 |
| 6 | 75 | 77 | 70 | 73 | 76 | 78 | 77 | 81 | 79 | 81 | 76.7 |
| 7 | 76 | 78 | 72 | 75 | 77 | 79 | 78 | 83 | 81 | 83 | 78.2 |
| 8 | 77 | 79 | 74 | 76 | 78 | 80 | 79 | 85 | 82 | 84 | 79.4 |
| 9 | 79 | 79 | 74 | 76 | 80 | 80 | 79 | 87 | 82 | 84 | 80.0 |
| **10** | 79 | 79 | **82** | **80** | 80 | 80 | 79 | 87 | 82 | 84 | **81.2** |

Movimientos de la décima ronda: **Automatización 74→82 (+8)** — de 2 señales con auto-tarea a 4, cubriendo el gap explícito que dejó documentado la novena ronda ("cobertura de más señales del pipeline: cotizaciones vencidas, clientes sin contacto"), más un mecanismo nuevo (el botón de un click) que resuelve el problema real de fuente de datos sin requerir integración con Contabilium. **Practicidad diaria 76→80 (+4)** — las 4 señales de negocio ahora son visibles sin abrir cada tarea (badge + paneles + plan de hoy), y el botón de cotización reduce fricción real reportada por Felipe. Los 8 frentes no tocados quedan sin cambio.

Es el salto más grande desde la ronda 2→3 (+6.7) si se mide solo en los frentes trabajados, aunque el promedio general (+1.2) es menor porque solo 2 de 10 frentes se movieron — consistente con la instrucción explícita de no tocar los otros 8.

## 5. ¿Cuánta pista queda en Automatización / Practicidad diaria después de esta ronda?

**Automatización — pista angosta en el patrón actual, pero con una puerta abierta documentada.** Las 4 señales cubren los casos donde "actuar" es inequívoco y de bajo riesgo (responder, retomar contacto, hacer seguimiento). El techo *duro* sigue siendo el mismo que documentó la séptima ronda: "nunca manda mensajes salientes, por decisión de producto" — decisión (b), no técnica. La única pista técnica real que queda sin decisión de producto es el tracking de cambio de etapa del pipeline (`stageChangedAt`), que permitiría una quinta clase de señal ("cotización vencida por etapa" en vez de por marca manual) — pero esa feature requiere agregar un campo nuevo y esperar que se use un tiempo antes de poder calcular nada con ella, así que su ganancia no es inmediata.

**Practicidad diaria — el hueco documentado en la séptima ronda ("recordatorios proactivos, atajos ampliados... depende de cómo Felipe quiere que el CRM interrumpa el día a día") sigue siendo la pista principal**, y sigue siendo (b) decisión de producto: ¿notificación push/email cuando se genera una auto-tarea? ¿Un email diario con el resumen de "Plan de hoy"? Son mejoras reales pero necesitan que Felipe decida el canal antes de construir nada, para no adivinar un mecanismo de interrupción que después no usa.

## 6. Estimado de rondas restantes

Promedio actual: **81.2%** (+1.2 vs. la novena ronda). Con el techo proyectado en 85-88%, quedan entre 3.8 y 6.8 puntos.

De los 10 frentes, 8 no se tocaron desde la ronda 8 o 9 y siguen con gaps técnicos documentados y sin resolver:
- **Frontend (80):** `pdf.worker.min` (1.26 MB) y `pdf-text` (430 kB) sin tocar — pista técnica pura, la más barata de las que quedan.
- **Datos (79):** falta backup automático — depende de una decisión de infraestructura (plan pago de Supabase o cron externo con `db dump`).
- **Testing (87):** faltan tests de interacción real en `Sales.jsx` (el flujo de `SaleModal`), `MercadoLibre.jsx`, `Board`/`Pipeline`/`WhatsAppInbox` — pista técnica pura, ya cerca del techo.
- **Seguridad (84):** falta ampliar a dependencias de terceros y headers de seguridad — retorno decreciente sin un pentest externo.
- **Backend (80), UX (79), UI (79), Documentación (82):** sin gaps nuevos documentados desde la ronda 8-9; requieren una auditoría dedicada para encontrar la próxima pista barata.

Recomendación concreta para una décimo primera ronda: **Frontend** (reducir el bundle de PDF) es la pista más barata y puramente técnica que queda sin decisión de producto pendiente — candidato natural para la próxima ronda si se quiere seguir subiendo el promedio general en vez de seguir profundizando Automatización/Practicidad, que ya empiezan a depender de decisiones de Felipe más que de trabajo técnico.
