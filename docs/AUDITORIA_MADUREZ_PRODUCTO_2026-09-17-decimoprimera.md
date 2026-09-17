# Auditoría de madurez de producto — décimo primera ronda (2026-09-17)

Metodología idéntica a las diez rondas anteriores: evidencia real ejecutada en vivo
(`node --import ./test/setup-dom.mjs --test`, `npm run build`), grep puntual sobre
el código, y `git diff --stat` contra el commit de cierre de la décima ronda
(`086981a`) para confirmar alcance.

A diferencia de la décima ronda (foco exclusivo en Automatización/Practicidad),
esta ronda tocó 6 de los 10 frentes: UX, UI, Automatización, Practicidad diaria,
Backend y Datos. Los otros 4 (Frontend, Testing, Documentación, Seguridad) se
mueven poco o nada, y se documenta explícitamente por qué.

## 1. Evidencia en vivo

```
node --import ./test/setup-dom.mjs --test
tests 458
suites 16
pass 458
fail 0
```

445 (cierre de la décima ronda) → 458: **+13 tests nuevos**, sin regresión en
ningún test preexistente.

```
npm run build
✓ built in 798ms
dist/assets/index-*.js       418.45 kB (antes 417.93 kB, +0.52 kB)
dist/assets/pdf.worker.min-*.mjs   1,265.41 kB (sin cambio)
dist/assets/pdf-text-*.js           430.30 kB (sin cambio)
```

Build limpio. El bundle principal crece marginalmente (+0.12%, el badge de
origen en Tasks.jsx); el bundle de PDF sigue exactamente igual — confirma que
Frontend no tuvo trabajo esta ronda, consistente con la recomendación de la
décima auditoría de dejarlo para cuando se ataque específicamente.

## 2. Alcance total confirmado (`git diff --stat` 10ª→11ª, excluyendo `docs/`)

```
 DESIGN.md                                          |  88 +++++++
 api/cron-daily-maintenance.js                      |  22 ++
 api/health.js                                      |  27 ++-
 api/mercadolibre-accounts.js                       |  34 ---
 api/mercadolibre-callback.js                       |  63 -----
 api/mercadolibre-connect.js                        |  21 --
 api/mercadolibre-sync.js                           | 103 --------
 api/tasks-intake.js                                |  81 +++++++
 lib/backup.mjs                                     | 147 ++++++++++++
 lib/mercadolibre.mjs                               |  69 ------
 api/readiness.js => lib/readiness.mjs              |   9 +-
 lib/tasks-intake.mjs                               |  44 ++++
 public/poliplast-isotipo-color.png                 | Bin 0 -> 65877 bytes
 src/App.jsx                                        |  72 +++---
 src/Board.jsx                                      | 258 ---------------------
 src/ClientDetail.jsx                               |  27 ++-
 src/Dashboard.jsx                                  |  49 +++-
 src/MercadoLibre.jsx                               | 158 -------------
 src/Tasks.jsx                                      |  15 +-
 src/styles.css                                     | 123 +++++-----
 src/technical-documents-repo.mjs                   |  21 +-
 src/technical-library.mjs                          |   1 -
 src/ui-primitives.jsx                              |  24 +-
 supabase/migrations/..._add_backups_storage_bucket.sql | 18 ++
 test/api.test.mjs                                  |  22 +-
 test/app-hooks-order.test.mjs                      |  41 ++++
 test/backup.test.mjs                               | 101 ++++++++
 test/components-smoke.test.mjs                     |   4 +-
 test/cron-daily-maintenance-retry.test.mjs         |  13 ++
 test/fixtures/sales-with-confirm.jsx               |  17 ++
 test/mercadolibre.test.mjs                         |  29 ---
 test/pipeline-sales-whatsapp-interaction.test.mjs  |  79 +++++++
 test/tasks-intake.test.mjs                         |  83 +++++++
 test/technical-documents-repo.test.mjs             |  21 ++
 vercel.json                                        |   3 +
 35 files changed, 1038 insertions(+), 849 deletions(-)
```

Nota importante: este diff acumula *tres* iniciativas distintas hechas en
secuencia desde el cierre de la 10ª ronda (backup+cron, limpieza de ML muerto,
rework visual de marca completo, endpoint de automatizaciones) — no una sola
feature. El detalle de cada una vive en sus propios commits (`git log`), no se
repite acá.

## 3. Verificación puntual por frente

**UI (79→86, +7):** rework visual completo de la identidad de marca real
(rojo `#ed1c24` / gris / grafito del isologo, ver `DESIGN.md`), 8 rondas
verificadas en navegador una por una: tokens base, Dashboard, Pipeline,
Cartera, Ventas, Tareas, Base técnica, Academia. Antes de esta ronda la UI
usaba una paleta verde/teal sin ninguna relación con la marca — era la brecha
más visible del producto y ya no existe. `src/styles.css` refleja 123 líneas
tocadas casi todas de color, no de estructura (cero regresión de layout).

**UX (79→82, +3):** dos frentes de fricción reducida — el badge de origen en
Tareas (`src/Tasks.jsx`) distingue de un vistazo qué tarea generó una
automatización externa vs. qué cargó Felipe a mano, y el botón "Abrir en
cotizador" en la ficha de cliente (`src/ClientDetail.jsx`) evita tener que
buscar manualmente al cliente en la otra app. Ninguno de los dos resuelve un
flujo completo todavía (el cotizador no lee los parámetros del lado suyo
todavía), por eso el salto es moderado, no grande.

**Automatización (82→87, +5):** nuevo endpoint `POST /api/tasks-intake`
(`lib/tasks-intake.mjs`, 44 líneas de lógica pura + 7 tests) que le da a
sistemas externos (las tareas programadas de Shopify/Mercado Libre) un canal
real para dejar hallazgos accionables en la bandeja de Tareas, con dedup por
`externalId` verificado en producción (reintento con el mismo id devuelve
`wasNew:false`, confirmado en vivo el 16/09). Es la primera vez que algo
externo al CRM puede escribirle datos de forma segura y auditable.

**Practicidad diaria (80→83, +3):** consecuencia directa de UX — el badge de
origen y el link al cotizador reducen pasos manuales reales, no solo se ven
mejor.

**Backend (80→84, +4):** se retiró la integración OAuth de Mercado Libre
completa (`api/mercadolibre-*.js`, `lib/mercadolibre.mjs`, `src/MercadoLibre.jsx`,
442 líneas muertas eliminadas — nunca tuvo un solo uso real) y se sumó
`tasks-intake` con el mismo patrón de auth/retry ya validado en
`cron-daily-maintenance.js`. Menos código muerto, un endpoint más con la
misma disciplina de siempre.

**Datos (79→85, +6):** el gap que la propia 10ª auditoría marcó como abierto
("falta backup automático") ya no existe: backup diario a Supabase Storage
funcionando y verificado con archivos reales en `storage.objects` (14 días de
retención). Además el cron que lo dispara pasó de nunca haber corrido
exitosamente (faltaba `CRON_SECRET`) a correr todos los días — confirmado con
logs reales de Vercel.

**Testing (87→90, +3):** 458 tests (+13). El agregado más valioso no es el
número sino el tipo: `test/app-hooks-order.test.mjs` es un test de regresión
estática que **habría detectado** el bug de React #310 (pantalla en blanco en
producción) antes de que llegara a producción — cierra exactamente el tipo de
brecha que motivó ese incidente. `test/backup.test.mjs` y
`test/tasks-intake.test.mjs` cubren los dos módulos server-side nuevos.

**Documentación (82→84, +2):** `DESIGN.md` (88 líneas) documenta la spec de
marca completa y el plan de rondas, ya ejecutado en su totalidad. Se descuenta
parte del avance porque conviven en el repo documentos de Codex sin cerrar
formalmente (`docs/HANDOFF_CODEX_A_CLAUDE_2026-09-18.md` con contradicciones
internas entre secciones de fechas distintas) — no es un problema que esta
auditoría resuelva, pero sí uno que impide un salto mayor.

**Seguridad (84→83, −1):** único frente que retrocede. El repositorio
`felicnokaert/poli-crm` pasó de privado a público (decisión explícita de
Felipe, no un incidente) entre el 16 y 17/09. Los secretos siguen viviendo
solo en variables de entorno de Vercel, nunca en el código — no hay una
exposición real de credenciales — pero la superficie de exposición del código
fuente en sí cambió, y una auditoría honesta lo refleja aunque sea una
decisión de negocio válida, no un error técnico.

**Frontend (80→80, sin cambio):** ningún archivo de esta categoría aparece en
el diff. `pdf.worker.min` (1.26 MB) y `pdf-text` (430 kB) siguen intactos —
sigue siendo la pista técnica más barata sin decisión de producto pendiente.

## 4. Tabla de las 11 rondas

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
| 10 | 79 | 79 | 82 | 80 | 80 | 80 | 79 | 87 | 82 | 84 | 81.2 |
| **11** | **82** | **86** | **87** | **83** | **84** | 80 | **85** | **90** | **84** | **83** | **84.4** |

Es el salto más grande desde la ronda 2→3 (+6.7) en términos absolutos
(+3.2), y el primero desde la ronda 5 en tocar más de 3 frentes a la vez —
consistente con que esta ronda acumuló varias iniciativas en secuencia en vez
de una sola dirigida.

## 5. Qué significa este número (y qué no)

84.4% sigue siendo un índice técnico/producto, no una medición de adopción
comercial. Nada de esto reemplaza confirmar con Felipe y el equipo que:
- el badge de origen y el link al cotizador se usan de verdad en el día a día;
- las tareas que llegan por `tasks-intake` se revisan y resuelven, no se
  acumulan sin leer;
- Shopify termina de cablear su lado del endpoint (ML ya lo confirmó en vivo).

## 6. Estimado de rondas restantes

Con el salto de esta ronda, el promedio pasa de 81.2% a **84.4%**. El techo
proyectado sigue en 85-88% (sin cambios respecto a la 10ª auditoría, porque
varios de los frentes que subieron todavía tienen pista técnica real, no solo
de producto): quedan entre 0.6 y 3.6 puntos.

De los 10 frentes, el más barato y puramente técnico que sigue sin tocar
desde hace 5 rondas es **Frontend** (bundle de PDF, 1.26 MB + 430 kB) —
recomendación sin cambios respecto a la 10ª auditoría: es la pista más clara
para una décimo segunda ronda si se quiere seguir el camino técnico puro. El
resto de los frentes con margen (UX, Practicidad, Seguridad) ya empiezan a
depender de decisiones de Felipe o de uso real más que de código nuevo.
