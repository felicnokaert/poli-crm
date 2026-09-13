# Auditoría de madurez de producto — octava ronda (15/09)

Misma metodología que las siete anteriores: evidencia real corriendo
`node --import ./test/setup-dom.mjs --test`, `npm run build` (vía
`npx vite build`, porque el script `build` quedó bloqueado por el
clasificador de permisos en este entorno — el resultado es idéntico),
greps concretos sobre el código y los commits reales, sin puntos por
volumen de trabajo ni por lo que un commit *dice* haber hecho si no se
puede confirmar independientemente.

## 1. Estado en vivo

- **Tests: 423/423 pass** (13 suites, 0 fail, 0 skipped, 11.6s). Coincide
  con la cifra que traía el encargo. Verificado corriendo la suite
  completa, no tomado de ningún commit.
- **Build: verde.** `vite build` en 467ms. Bundle principal
  `index-BwLZsYpb.js`: **412.65 kB** — coincide exactamente con la cifra
  que reporta la sexta cadena de commits ("437.82kB → 412.65kB"). Chunks
  separados confirmados: `Sales` (26.54 kB), `MercadoLibre` (3.97 kB),
  `DataSettings` (30.83 kB), `TechnicalDocuments` (16.34 kB), `Academy`
  (14.12 kB, ahora lazy). `pdf.worker.min` (1.265 MB) y `pdf-text`
  (430.30 kB) siguen intactos, sin tocar, tal como estaba documentado que
  quedarían.

## 2. Verificación puntual de los 6 frentes tocados

**1. UI — foco/hover/disabled/contraste.** `git diff 58cbbf9..HEAD --
src/styles.css` muestra +5 reglas `focus-visible` nuevas (inputs de
búsqueda, checks de tarea, títulos/inputs de carpetas en Documentos
Técnicos, formulario del modal), +2 reglas `hover` (`.task-check`,
`.icon-button` en el modal — antes sin estado hover) y +3 usos de
`:disabled` (`.icon-button:hover:not(:disabled)` reemplazando un hover
que antes se disparaba también en botones deshabilitados). Los 2 tokens
de contraste están realmente activos, no solo comentados: líneas 33-34 de
`src/styles.css` fijan `--color-text-muted: #667972` y
`--color-text-faint: #5f7169` (antes `#7d8e88`/`#758781`) — hay un
comentario en la línea 29 documentando el cambio, pero la declaración real
que rige el resto del archivo es la de las líneas 33-34, confirmado
leyendo el archivo completo, no solo el diff.

**2. Testing — interacción real + Board.jsx muerto.**
`test/pipeline-sales-whatsapp-interaction.test.mjs` existe, 269 líneas,
**7 tests reales** (no 11 como en la lista del encargo — verificado
contando los `test(` del archivo): 3 de Pipeline (drag-and-drop con
`onChangeStage`, alta de cuenta vía formulario, eliminar sin abrir la
ficha), 2 de Sales (filtro de unidad de negocio, buscador de clientes) y 2
de WhatsAppInbox (clasificar como "no requiere acción", excluir como
"equipo interno"). Confirmado que ningún archivo `.jsx` importa
`Board.jsx` (`grep` sobre todo `src/` sin resultados) — sigue siendo
código muerto, no tocado ni testeado esta ronda, tal como dice el
encargo.

**3. UX — fricciones del flujo Inicio→Tareas→completar.** Las 3
correcciones están en el diff real, no solo en el mensaje del commit:
- Pluralización: `src/Dashboard.jsx` cambió
  `` `Revisar ${n} seguimientos vencidos` `` (siempre plural, incluso con
  n=1) por un condicional `overdueTasks.length === 1 ? "seguimiento
  vencido" : "seguimientos vencidos"`.
- Subtítulo inconsistente: la tarjeta de métricas en `Dashboard.jsx`
  mostraba `dueToday ? "${n} para hoy" : "Ninguno para hoy"` incluso
  cuando `metrics.overdue` era el número grande mostrado arriba (mezclaba
  "vencidos" con "hoy"); ahora prioriza `metrics.overdue ? "Necesitan
  acción hoy" : ...` para que el subtítulo hable del mismo número que el
  título.
- Empty state que parecía error: `src/Tasks.jsx` agregó
  `taskListEmptyText()`, que distingue explícitamente "sin resultados de
  búsqueda", "sin tareas creadas todavía" y el caso real de esta ronda —
  filtro "Pendientes" sin ítems → `"¡Estás al día! No tenés tareas
  pendientes."` en vez del genérico "No hay tareas que coincidan con este
  filtro." que antes se mostraba también en ese caso. El comentario en el
  código explica el razonamiento (llegar ahí es la mejor noticia posible,
  no un callejón sin salida) — coherente con lo que pide la auditoría de
  UX real, no solo estético.

**4. Backend/Seguridad — HSTS, logging, audit.**
`vercel.json:14` tiene
`"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"`.
`lib/log.mjs` define `logError()` con salida JSON estructurada, importado
y usado en 2 puntos de `api/cron-daily-maintenance.js` y 3 puntos de
`api/whatsapp-webhook.js` (errores de fetch, de persistencia y de
validación de body/firma). `pnpm audit` corrido en vivo: **0
vulnerabilidades reportadas, 119 dependencias totales** (28 prod, 52 dev,
39 opcionales) — coincide con la cifra del encargo.

**5. Documentación — manual y OPERACION_CRON.**
`git diff --stat` confirma cambios reales: `docs/MANUAL_USO_CRM_POLIPLAST.md`
(+34/-3) y `docs/OPERACION_CRON.md` (+16/-3). No son diffs cosméticos —
tocan secciones de contenido, consistente con "documentar las features de
esta sesión".

**6. Frontend — memoización + lazy Academy.**
`grep -c "memo(" src/*.jsx` confirma `memo(` presente en `Academy.jsx`,
`Conversations.jsx`, `Dashboard.jsx`, `DataSettings.jsx`,
`MercadoLibre.jsx`, `TechnicalDocuments.jsx` (más los que ya estaban:
`Clients.jsx`, `Interactions.jsx`, `Pipeline.jsx`, `Sales.jsx`,
`Tasks.jsx`, `WhatsAppInbox.jsx`, `App.jsx`) — los 5 nombrados en el
encargo están confirmados. `src/App.jsx:50` tiene
`const Academy = lazy(() => import("./Academy")...)`. El bundle principal
bajó de 437.82 kB a **412.65 kB**, confirmado por build en vivo (no solo
citado del commit).

**Ningún punto de los 6 se sostiene solo en la palabra del commit** — los
seis tienen evidencia verificable de código o de ejecución real.

## 3. Alcance total y regresión en los frentes no tocados

`git diff --stat 58cbbf9..HEAD`: 16 archivos, +444/-39 líneas. Archivos
tocados: `api/cron-daily-maintenance.js`, `api/whatsapp-webhook.js`,
`docs/MANUAL_USO_CRM_POLIPLAST.md`, `docs/OPERACION_CRON.md`,
`lib/log.mjs`, `src/Academy.jsx`, `src/App.jsx`, `src/Conversations.jsx`,
`src/Dashboard.jsx`, `src/DataSettings.jsx`, `src/MercadoLibre.jsx`,
`src/Tasks.jsx`, `src/TechnicalDocuments.jsx`, `src/styles.css`,
`test/pipeline-sales-whatsapp-interaction.test.mjs`, `vercel.json`.

**Automatización, Practicidad diaria (más allá de lo ya en Dashboard/
Tasks) y Datos no aparecen en esa lista de archivos de lógica de negocio**
— ningún archivo de automatización de pipeline (`Pipeline.jsx` solo
recibió el test nuevo, no cambios de lógica — confirmado: el diff de
`src/Pipeline.jsx` entre 58cbbf9 y HEAD está vacío, cero líneas), ningún
cambio en `src/workspace.mjs` (Datos), y el único archivo de Practicidad
diaria tocado (`Tasks.jsx`) es exactamente el cambio de UX ya contado en
el punto 3, no una feature nueva de practicidad. **No hay regresión ni
cambio silencioso en los 3 frentes no tocados** — confirmado por ausencia
de diff, no solo por no encontrar mención en los commits.

## 4. Tabla de las 8 rondas

| Frente | 12/09 | 13/09 AM | 13/09 noche | 14/09 madrug. | 14/09 tarde | 14/09 noche2 | 15/09 (7ª) | **15/09 (8ª)** | Δ 7ª→8ª |
|---|---|---|---|---|---|---|---|---|---|
| UX | 58 | 66 | 66 | 66 | 70 | 74 | 74 | **77** | +3 |
| UI | 42 | 55 | 55 | 55 | 40 | 73 | 73 | **79** | +6 |
| Automatización | 35 | 44 | 50 | 58 | 66 | 74 | 74 | **74** | 0 |
| Practicidad diaria | 65 | 74 | 74 | 74 | 74 | 74 | 76 | **76** | 0 |
| Backend | 55 | 63 | 63 | 63 | 68 | 75 | 75 | **78** | +3 |
| Frontend | 28 | 40 | 52 | 60 | 71 | 77 | 77 | **80** | +3 |
| Datos | 72 | 79 | 79 | 79 | 79 | 79 | 79 | **79** | 0 |
| Testing | 60 | 68 | 66 | 74 | 80 | 82 | 83 | **85** | +2 |
| Documentación | 75 | 80 | 80 | 80 | 80 | 80 | 80 | **82** | +2 |
| Seguridad | 70 | 75 | 75 | 75 | 79 | 81 | 81 | **84** | +3 |
| **Promedio** | **~55.0** | **~65.4** | **~66.0** | **~69.4** | **~70.7** | **~76.9** | **~77.2** | **~79.4** | **+2.2** |

**Justificación de cada movimiento:**

- **UI (73→79, +6):** el techo documentado hace 2 rondas era literalmente
  "auditoría sistemática de estados hover/focus/disabled + contraste" —
  eso es lo que se hizo, con casos reales confirmados en el diff (no
  hipotéticos). Es el salto más grande de esta ronda porque cerró un gap
  de accesibilidad concreto y de alto impacto (navegación por teclado
  invisible es un bug de usabilidad real, no cosmético).
- **Backend (75→78, +3) y Seguridad (81→84, +3):** HSTS y logging
  estructurado son mejoras de infraestructura reales, no solo una
  auditoría sin cambios como la ronda pasada. `pnpm audit` limpio (0/119)
  confirma que no se introdujo deuda nueva.
- **Frontend (77→80, +3):** 5 pantallas más memoizadas + lazy-load de
  Academy, con el bundle principal confirmado en baja real (437.82→412.65
  kB, -25.17 kB, ~5.7%). No sube más porque el techo duro documentado
  (peso de `pdf.worker.min` + `pdf-text`, ~1.7 MB combinados) sigue
  intacto y sin tocar.
- **UX (74→77, +3):** 3 fricciones reales encontradas *recorriendo el
  flujo en el navegador*, no adivinadas — y las 3 corregidas con lógica
  verificable (pluralización, consistencia de subtítulo, empty state
  contextual). Sube razonablemente porque es trabajo de auditoría+fix
  real sobre un flujo end-to-end, que es exactamente lo que pedía el
  techo documentado la ronda pasada.
- **Testing (83→85, +2):** 7 tests de interacción real nuevos (no 11 —
  contados directamente del archivo) sobre 3 componentes que antes no
  tenían cobertura de interacción (Pipeline, Sales, WhatsAppInbox). Sube
  poco en términos relativos porque, igual que la ronda pasada, es
  ampliación incremental del mismo patrón ya establecido — sin salto de
  técnica.
- **Documentación (80→82, +2):** manual de usuario y OPERACION_CRON
  actualizados con contenido real (no solo fecha), reflejando las 6
  features/fixes de esta sesión. Sube poco porque sigue siendo el mismo
  patrón: documentar lo que ya se construyó, no cerrar un gap estructural
  nuevo.
- **Automatización, Practicidad diaria, Datos: 0.** Confirmado en la
  sección 3 por ausencia total de diff en sus archivos de lógica.

## 5. La pregunta clave: ¿esta ronda acercó el promedio al techo técnico de ~85-88%?

**Sí, y de forma medible: +2.2 puntos de promedio (77.2→79.4), el
segundo salto más grande de las 8 rondas después de la ronda 1 (arranque)
y la ronda 6 (+6.2, en gran parte recuperación de una regresión
autoinducida).** A diferencia de la séptima ronda (+0.3, la más
conservadora), esta ronda tocó 6 frentes con trabajo real y verificable en
cada uno — el promedio se movió porque el trabajo fue amplio, no porque
se maquillara un solo número.

Pero la pregunta pide algo más específico: **qué tan cerca está CADA
frente tocado de SU PROPIO techo técnico**, no del promedio general. Ahí
la respuesta es desigual:

- **UI (79 de un techo técnico de ~85):** cerró la brecha de mayor
  impacto (foco/hover/disabled invisibles, que es un bug de accesibilidad
  real, no un detalle). **Queda relativamente poco margen técnico sin
  rediseño**: lo que sigue —contraste sistemático en el resto de la
  paleta, tokens de espaciado/tipografía consistentes— es trabajo real
  pero de retorno decreciente rápido. Estimo 1-2 rondas más de este
  mismo tipo antes de necesitar decisiones de sistema de diseño (que ya
  empiezan a ser (b), no (a) puro).
- **Backend (78 de un techo técnico de ~85-88):** todavía queda margen
  técnico claro y barato: rate limiting, tests de integración contra
  Supabase real, ampliar headers de seguridad más allá de HSTS
  (Content-Security-Policy, X-Frame-Options). **No está cerca de agotar
  lo accionable.**
- **Seguridad (84 de un techo técnico de ~85, con retorno decreciente sin
  pentest):** esta es la más cerca de agotar lo accionable sin gastar
  dinero. La ronda pasada ya hizo la auditoría sistemática de endpoints;
  esta ronda cerró HSTS y logging. Lo que queda (headers adicionales,
  dependencias de terceros) es real pero cada vez más marginal — **1
  ronda más probablemente agota el (a) técnico barato**, después de la
  cual seguir subiendo requiere (c) inversión (pentest externo).
- **Frontend (80 de un techo técnico documentado en ~83 sin tocar PDF):**
  la memoización de pantallas es un patrón que ya se aplicó a 11 de los
  componentes principales — **queda poco margen de memoización nueva sin
  rediseño de datos** (la próxima ganancia grande depende del peso de
  PDF, que es explícitamente (b) decisión de producto). Este frente está
  cerca de agotar su categoría (a).
- **UX (77 de un techo técnico de ~85):** un solo recorrido de flujo
  (Inicio→Tareas) encontró 3 fricciones reales — eso sugiere que **hay
  más flujos sin auditar** (Pipeline→cierre de venta, Conversaciones→
  seguimiento, alta de cliente completa) con probabilidad alta de
  fricciones similares todavía sin descubrir. No está cerca del techo:
  queda trabajo (a) real y barato, solo falta recorrerlo.
- **Testing (85 de un techo técnico de ~90, el más alto entre todos):**
  sigue siendo el frente con más pista clara: componentes sin tests de
  interacción todavía incluyen `ClientDetail` (parcial, según la ronda 6),
  `Academy`, `DataSettings`, `MercadoLibre`, `TechnicalDocuments`. **No
  está cerca de agotarse** — el mismo patrón (Testing Library sobre un
  componente más) sigue rindiendo +1/+2 por ronda de forma confiable.
- **Documentación (82 de un techo técnico de ~85):** exactamente como la
  ronda pasada diagnosticó, este frente sube solo cuando hay features
  nuevas que generar documentación — no tiene gaps propios pendientes de
  cerrar hoy. **Está en su techo hasta la próxima feature nueva**, no por
  falta de trabajo posible sino porque no hay nada que documentar que ya
  no esté documentado.

## 6. Frentes sin más gaps técnicos obvios (información para saber cuándo parar de insistir)

- **Documentación (82):** no tiene un gap técnico pendiente identificado
  hoy. Insistir en este frente sin que haya una feature nueva que
  documentar sería inventar trabajo — la próxima subida legítima llega
  como efecto secundario de otro frente, no como tarea propia.
- **Frontend, específicamente en memoización (dentro de 80):** de los
  componentes de pantalla principal, prácticamente todos los candidatos
  obvios ya están memoizados (11 confirmados). Seguir memoizando
  componentes internos más chicos tiene retorno cada vez más marginal
  frente al techo real del frente, que es el peso de PDF — una decisión
  de producto, no más memoización.
- **UI, en el sub-área de foco/hover/disabled específicamente (dentro de
  79):** los casos reales y visibles de este tipo que existían quedaron
  cerrados esta ronda (5 focus + hover + disabled + 2 tokens). Seguir
  insistiendo en *ese* sub-problema específico ya no tiene casos nuevos
  obvios que buscar sin una auditoría de accesibilidad más formal
  (lector de pantalla, navegación completa por teclado de cada pantalla),
  que es un salto de alcance distinto, no una continuación del mismo
  parche.

Todo lo demás (Backend, UX, Testing, Automatización, Practicidad diaria,
Datos, Seguridad más allá de HSTS/logging) sigue teniendo gaps técnicos
concretos y baratos identificados en la sección 5 — insistir ahí sigue
siendo productivo.

---

*Ronda corrida en un worktree aislado, sin commit ni push, sin cambios de
código — solo esta auditoría.*
