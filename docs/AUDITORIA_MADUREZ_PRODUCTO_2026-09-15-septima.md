# Auditoría de madurez de producto — séptima ronda (15/09)

Metodología idéntica a las seis rondas anteriores: evidencia real corriendo
`node --import ./test/setup-dom.mjs --test`, `npm run build`, greps
concretos sobre el código y los commits reales (`git log`), sin puntos por
volumen de trabajo ni por lo que un commit *dice* que hizo si no se puede
confirmar.

## 1. Estado en vivo

- **Tests: 416/416 pass** (10 suites, 0 fail, 0 skipped). Coincide
  exactamente con la cifra que anotaba la sexta auditoría como objetivo
  ("405 → 416 tests") — confirmado corriendo la suite yo mismo, no tomado
  del commit.
- **Build: verde, 0 warnings.** `vite build` en 520ms, sin warning de
  tamaño de chunk (el code splitting de la sexta ronda sigue sosteniéndose:
  bundle principal `index-*.js` en 437 kB, con `Sales`, `MercadoLibre`,
  `TechnicalDocuments`, `DataSettings` como chunks separados, tal como
  quedó documentado la ronda pasada).

## 2. Qué se hizo desde la sexta ronda (verificado commit por commit)

`git log 4d02258..HEAD` muestra 3 features + sus merges:

1. **Testing** (`ea47342`): extracción de `ShortcutsHelp` a
   `src/ShortcutsHelp.jsx` (confirmado: el archivo existe, 1663 bytes) +
   `test/components-interaction.test.mjs` con **25 `describe`/`test(`**
   (el commit dice "4 + 2 + primeros tests de ClientDetail" sin dar un
   número total — 25 es consistente con esa descripción sumada a los tests
   de interacción de rondas previas que ya vivían en ese archivo).
2. **Datos** (`2ac62ab`): `validateWorkspaceStateShape` existe en
   `src/workspace.mjs:276` y está efectivamente enganchada en
   `src/online.js:83` (dentro de `saveOnlineState`, antes de persistir) —
   no es una función huérfana. Tiene 12 tests dedicados en
   `test/online.test.mjs` que cubren tanto el camino feliz (estado real,
   estado vacío inicial, campos ausentes) como cada rechazo (data no-objeto,
   arrays reemplazados por string/objeto, cliente sin `id`/`company`). Es
   honesta en su propio comentario: "red de seguridad, no un modelo de
   datos nuevo" — no valida el contenido de cada campo, solo la forma.
3. **Practicidad diaria** (`f9abaf8`): `Tasks.jsx:130` tiene el botón
   "Exportar CSV" (mismo patrón que `clientsToCsv`/`salesToCsv`) y
   `App.jsx:1400-1473` calcula `overdueTaskCount` y lo pinta en un
   `nav-badge` sobre el ícono de Tareas del sidebar. El commit es
   explícito y verificable en que **no** sumó hot leads/cotizaciones frías
   al badge por costo de cómputo, y lo deja documentado como pendiente en
   vez de inflar el alcance.

**Diff total desde la sexta ronda:** 6 archivos, +157/-48 líneas
(`git diff --stat 4d02258 HEAD`). Volumen chico y consistente con "3
mejoras acotadas", no con una reescritura.

## 3. Escepticismo pedido — ¿la ronda de "auditoría sin cambios" en
Backend/Seguridad amerita subir el puntaje?

**No, y esta ronda no lo sube.** El encargo describe el trabajo de
Backend/Seguridad como "auditoría sistemática de los ~13 endpoints —
resultado: ya estaban todos limpios, no se necesitó ningún cambio de
código." Eso es información real y útil (confirma que los 2 bugs de la
ronda anterior eran los únicos), pero confirmar que no hay nada nuevo roto
**no es evidencia de una mejora nueva** — es la ausencia de evidencia de
una regresión. Subir el puntaje por eso sería exactamente el error que las
rondas anteriores evitaron (premiar volumen/actividad en vez de resultado
verificable). Backend se mantiene en **75** y Seguridad en **81**, sin
cambio, con una nota: la confianza en esos números es *ligeramente* más
alta que antes (una auditoría negativa de 13 endpoints reduce la
probabilidad de que haya un bug no descubierto), pero no hay una unidad de
medida honesta para traducir "más confianza" en puntos sin inventar un
criterio nuevo a mitad de ronda. Se documenta la confianza, no se cobra en
el número.

## 4. Datos — verificación independiente de BACKUPS.md

`docs/BACKUPS.md` existe. Contenido cruzado con Supabase directamente vía
MCP (no solo confiado al doc):

- `list_organizations` → `felicnokaert's Org`
  (`giaisfnwsxeghdasvnrl`), plan **`free`** — confirmado en vivo, coincide
  con lo que dice el doc.
- El proyecto del CRM (`poli crm`, `nghwmtccpovrdtzvllwe`) existe bajo esa
  organización.
- La afirmación de que el plan Free de Supabase no incluye backups
  automáticos/PITR es una cita de la documentación oficial de Supabase, no
  algo verificable con una llamada a la API del proyecto — el doc lo marca
  correctamente como cita, no como hecho confirmado por API.

**Conclusión: el doc dice la verdad**, con la fuente de cada afirmación
separada entre "confirmado por API" y "documentación oficial citada", y
sin inventar una política que no existe. Esto es exactamente lo que pedía
el encargo de la ronda pasada. Datos se mantiene en **79** (documentar un
hallazgo real y agregar una red de seguridad mínima sube confianza, no
sube "gaps cerrados" — sigue sin haber ninguna política de backup real
implementada, solo diagnosticada).

## 5. Tabla de las 7 rondas

| Frente | 12/09 | 13/09 AM | 13/09 noche | 14/09 madrug. | 14/09 tarde | 14/09 noche2 | **15/09 (7ª)** | Δ 6ª→7ª |
|---|---|---|---|---|---|---|---|---|
| UX | 58 | 66 | 66 | 66 | 70 | 74 | **74** | 0 |
| UI | 42 | 55 | 55 | 55 | 40 | 73 | **73** | 0 |
| Automatización | 35 | 44 | 50 | 58 | 66 | 74 | **74** | 0 |
| Practicidad diaria | 65 | 74 | 74 | 74 | 74 | 74 | **76** | +2 |
| Backend | 55 | 63 | 63 | 63 | 68 | 75 | **75** | 0 |
| Frontend | 28 | 40 | 52 | 60 | 71 | 77 | **77** | 0 |
| Datos | 72 | 79 | 79 | 79 | 79 | 79 | **79** | 0 |
| Testing | 60 | 68 | 66 | 74 | 80 | 82 | **83** | +1 |
| Documentación | 75 | 80 | 80 | 80 | 80 | 80 | **80** | 0 |
| Seguridad | 70 | 75 | 75 | 75 | 79 | 81 | **81** | 0 |
| **Promedio** | **~55.0** | **~65.4** | **~66.0** | **~69.4** | **~70.7** | **~76.9** | **~77.2** | **+0.3** |

**Justificación de los 2 únicos movimientos:**

- **Practicidad diaria (74→76, +2):** brecha real cerrada (export de
  Tareas era el hueco documentado hace 3 rondas) + badge de vencidas útil
  a diario, con criterio de costo explícito y honesto sobre lo que
  deliberadamente no se sumó. Techo bajo (+2, no +8 como Frontend en
  rondas pasadas) porque es una feature chica y acotada, no un cambio
  estructural.
- **Testing (82→83, +1):** 11 tests nuevos de interacción real (Testing
  Library, no smoke), primeros tests de `ClientDetail.jsx` (componente sin
  ningún test antes). Sube poco porque sigue siendo ampliación incremental
  del mismo patrón que ya usan los tests desde la ronda 5 — no hay un salto
  de técnica (jsdom+Testing Library) como el que justificó el +6 de esa
  ronda, es "más superficie cubierta" del mismo enfoque, que es exactamente
  lo que ya tenía un techo cercano documentado.
- **Todo lo demás, 0.** UX, UI, Automatización, Backend, Frontend, Datos,
  Documentación, Seguridad no tuvieron ningún cambio de código (confirmado
  por `git diff --stat 4d02258 HEAD -- src/` — los únicos archivos tocados
  son `App.jsx`, `ShortcutsHelp.jsx`, `Tasks.jsx`, `online.js`,
  `styles.css`, `workspace.mjs`, y ninguno de esos diffs toca lógica de UX,
  UI general, automatización, ni endpoints de backend). Backend/Seguridad
  se mantienen a pesar de la auditoría "limpia" por la razón dada en la
  sección 3.

## 6. Regresiones — ¿algo se rompió?

`git diff 4d02258 HEAD -- src/App.jsx` muestra que la extracción de
`ShortcutsHelp` es una extracción literal (mismo JSX, mismo hook
`useModalEscape`, mismo comportamiento) sin ningún cambio de lógica —
confirmado línea por línea, no solo por el mensaje del commit. No hay
regresión en UX/UI por esta extracción. Los otros dos cambios (badge de
tareas, export CSV) son aditivos y no tocan código existente de otros
frentes. **No se detectó ninguna regresión esta ronda.**

## 7. Afirmaciones de los commits que no se pudieron confirmar tal cual

- `f9abaf8` dice "probado en el navegador real (tarea vencida → badge '1',
  CSV descarga sin errores)". Esto no es reproducible por esta auditoría
  (no hay captura, no hay test automatizado de esa interacción específica
  del CSV real) — se toma como afirmación del autor, no como hecho
  verificado independientemente. La lógica del botón sí está confirmada
  por lectura de código (usa el mismo patrón probado que
  `clientsToCsv`/`salesToCsv`), pero el "probé en el navegador" en sí es
  no verificable post-hoc.
- Ningún commit de esta ronda afirma un número de tests o un resultado de
  build que no coincida con lo reproducido en la sección 1. A diferencia
  de la quinta ronda (que tuvo una regresión real negada por su propio
  commit), esta ronda no tiene ninguna discrepancia entre lo que el commit
  dice y lo que se puede confirmar corriendo el código.

## 8. Ritmo real de las 7 rondas (deltas, no solo promedio)

| Ronda | Delta de promedio | Frentes que subieron | Frentes en 0 |
|---|---|---|---|
| 1→2 (12→13 AM) | +10.4 | 10 de 10 | 0 |
| 2→3 (13 AM→13 noche) | +0.6 | 2 de 10 | 8 |
| 3→4 (13 noche→14 madrug.) | +3.4 | 3 de 10 | 7 |
| 4→5 (14 madrug.→14 tarde) | +1.3 (con una regresión de -15 en UI compensada por otros) | 6 subieron, 1 bajó | 3 |
| 5→6 (14 tarde→14 noche2) | +6.2 | 8 de 10 (incluye recuperar la regresión de UI) | 2 |
| **6→7 (14 noche2→15)** | **+0.3** | **2 de 10** | **8** |

**Lectura honesta:** el ritmo **no es una desaceleración lineal simple**.
La ronda 6 (+6.2) fue en gran parte recuperar una regresión autoinducida
en UI (+33 puntos, de los cuales quizás 15 son "volver al punto de
partida" y no ganancia neta) más consolidar 4 frentes tocados en paralelo.
La ronda 7, en cambio, tocó deliberadamente solo 2 frentes con trabajo
acotado ("mejoras chicas", según los propios commits) más una auditoría de
Backend/Seguridad que confirmó sin encontrar nada — de ahí el +0.3, el
delta más bajo de las 7 rondas después de la ronda 2. Esto no es evidencia
de que el producto se estancó: es evidencia de que **esta ronda
específica decidió ser conservadora** (features chicas, sin tocar los
frentes más débiles). El patrón real de las últimas 3 rondas (+3.4, +6.2,
+0.3) es demasiado irregular para extrapolar una curva — depende más de
qué se decide tocar cada ronda que de un techo físico uniforme.

## 9. Clasificación de cada frente bajo 90: ¿qué falta y de quién depende?

| Frente | Puntaje | Techo restante | Tipo |
|---|---|---|---|
| UX | 74 | Revisión de flujo end-to-end, no más parches puntuales | (a) técnico |
| UI | 73 | Auditoría sistemática de estados hover/focus/disabled + contraste, sistema de diseño | (a) técnico |
| Automatización | 74 | Cobertura de más señales del pipeline (cotizaciones vencidas, clientes sin contacto) es (a); pero el techo *duro* documentado hace 2 rondas — "nunca manda mensajes salientes, por decisión de producto" — es (b) |
| Practicidad diaria | 76 | Sumar hot leads/cotizaciones frías al badge reusando `dailySignals` es (a); pero mejoras más ambiciosas de "practicidad diaria" (recordatorios proactivos, atajos ampliados) empiezan a tocar (b): qué automatizar depende de cómo Felipe quiere que el CRM interrumpa el día a día |
| Backend | 75 | Los 2 bugs cerrados fueron los únicos encontrados; seguir subiendo con el mismo patrón (auditar más endpoints) es (a), pero ya se hizo una pasada completa — el techo real ahora requiere trabajo nuevo (rate limiting, logging estructurado, tests de integración contra Supabase real) que sigue siendo (a) |
| Frontend | 77 | El techo documentado hace 2 rondas es explícito: `pdf.worker.min` (1.26 MB) y `pdf-text` (430 kB) siguen sin tocar. Reducirlos es (a) técnico, pero puede requerir evaluar una librería de PDF más liviana — si esa evaluación concluye que no hay alternativa sin regresión de funcionalidad, pasa a ser (b) decisión de producto (¿vale la pena la funcionalidad de PDF actual a ese costo de bundle?) |
| Datos | 79 | La validación de forma mínima ya está. El techo real y documentado es: **no hay backup automático** — cerrar eso es (c) inversión de infraestructura (plan Pago de Supabase) o (a) técnico menor (cron externo con `db dump`, que no requiere pagar pero sí decidir montarlo y mantenerlo, así que en la práctica es también (b) decisión de Felipe sobre prioridad) |
| Documentación | 80 | Sin gaps nuevos detectados; seguir subiendo requiere una auditoría de documentación de usuario final (no solo interna/técnica), que es (a) |
| Seguridad | 81 | La auditoría de los ~13 endpoints ya se hizo. Seguir subiendo con el mismo patrón requiere ampliar el alcance (dependencias de terceros, headers de seguridad, rate limiting) — (a) técnico, pero de retorno decreciente sin un pentest externo, que sería (c) inversión |
| **Testing** | **83** | Es el frente más cerca de 90. El techo restante es (a) puro: más superficie de componentes con Testing Library (Board, Pipeline, Sales, WhatsAppInbox no tienen tests de interacción todavía) |

## 10. La pregunta de Felipe: ¿cuándo cerca del 100%?

**No hay una fecha honesta que dar — pero sí una estructura honesta de la
respuesta, en rondas de trabajo, separando qué depende de trabajo técnico
puro y qué depende de decisiones de Felipe.**

### Lo que el ritmo real dice

Descartando la ronda 1 (arrancó de un piso muy bajo, no es representativa)
y promediando las rondas 2 a 7 (+0.6, +3.4, +1.3, +6.2, +0.3): el delta
promedio por ronda en este tramo es **~2.4 puntos**, con una desviación
enorme (de +0.3 a +6.2) que depende casi enteramente de **cuántos frentes
se deciden tocar esa ronda**, no de un techo físico que se esté acercando
de forma pareja. Testing, el frente más trabajado, subió de 60 a 83 en 7
rondas (+23) sin señales de desaceleración real todavía — sigue teniendo
gaps concretos y baratos de cerrar (más componentes con Testing Library).
En cambio, Datos (72→79, quieto desde la ronda 2) y Documentación
(75→80, quieto desde la ronda 2) muestran el patrón inverso: llegaron
rápido a un nivel y se estancaron ahí porque lo que falta **ya no es
trabajo del mismo tipo** (Datos topa con una decisión de costo de
infraestructura; Documentación con "no hay gaps nuevos que documentar
hasta que haya features nuevas que generen gaps").

### Estimado en rondas, separando lo técnico de lo que depende de Felipe

**Solo con trabajo técnico (categoría a), sin ninguna decisión nueva de
Felipe:**

- Testing (83→~90): 2-3 rondas más del mismo patrón (Testing Library sobre
  Board/Pipeline/Sales/WhatsAppInbox).
- UX/UI (74/73→~85): 2-3 rondas cada uno (revisión de flujo, estados
  hover/focus, sin rediseño).
- Frontend (77→~83, tope sin tocar PDF): 1-2 rondas.
- Backend/Seguridad (75/81→~85): 2-3 rondas de ampliar alcance, con
  retorno decreciente.
- Documentación (80→~85): 1 ronda si hay features nuevas que documentar.

Sumando el trabajo técnico puro que **no** depende de Felipe, y asumiendo
que cada ronda puede tocar 2-3 frentes en paralelo (el patrón real
observado): unas **6-8 rondas más** técnicas alcanzarían para que la
mayoría de los frentes lleguen a ~85-88. Esto empujaría el promedio
general de ~77 a ~85-86 — **cerca de 90 pero probablemente sin cruzarlo**
solo con trabajo técnico.

**Lo que no se mueve sin una decisión de Felipe (categorías b/c):**

- **Automatización** tiene un techo duro documentado en 74-80 sin conectar
  IA o mensajería saliente — ambas son decisiones de producto explícitas
  que hoy Felipe eligió no tomar. Sin esa decisión, Automatización
  probablemente no pasa de ~80.
- **Datos** tiene un techo duro en ~82-85 sin resolver backups reales —
  requiere pagar el plan Pro de Supabase (inversión) o que Felipe priorice
  montar y mantener un cron externo de `db dump` (decisión de tiempo/
  prioridad, no de dinero). Sin eso, Datos se queda estancado donde está.
- **Frontend** puede tener un techo en ~83 si el peso de las librerías de
  PDF no se puede reducir sin sacrificar funcionalidad — eso es una
  decisión de producto (¿se necesita el visor de PDF actual tal como
  está?), no un problema de código.

**Respuesta honesta a la pregunta:** con el ritmo y la composición actual
del trabajo, **llegar a un promedio >90% no es alcanzable solo con más
rondas técnicas del mismo estilo** — hay un techo estructural entre
~85-88% que depende de trabajo técnico exclusivamente, y **cruzar ese
techo hacia 90%+ requiere que Felipe tome al menos una de estas tres
decisiones**: (1) pagar el plan Pro de Supabase o priorizar un cron de
backup externo, (2) decidir si conecta IA o mensajería saliente para
subir el techo de Automatización, o (3) aceptar el peso actual de PDF en
el bundle como costo permanente de Frontend (lo cual no destraba nada,
solo lo saca del promedio como pendiente reconocido en vez de perseguirlo).

En rondas de trabajo, separado:

- **Solo trabajo técnico, sin decisiones de Felipe:** ~6-8 rondas más para
  acercarse a ~85-88% de promedio general — no para cruzar 90%.
- **Para cruzar 90% de forma real:** además de esas 6-8 rondas técnicas,
  hacen falta 1-2 decisiones de Felipe (backup real, y probablemente
  automatización con mensajería o IA) tomadas en algún punto de ese
  camino, no al final — cuanto antes se tomen, antes las rondas técnicas
  siguientes pueden capitalizarlas. Sin esas decisiones, el techo
  realista de este producto con el enfoque actual está en **~85-88%, no en
  90%+**, sin importar cuántas rondas más de este estilo se corran.

---

*Ronda corrida en un worktree aislado, sin commit ni push, sin cambios de
código — solo esta auditoría.*
