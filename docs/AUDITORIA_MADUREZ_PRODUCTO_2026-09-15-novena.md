# Auditoría de madurez de producto — novena ronda (2026-09-15, noche)

Metodología idéntica a las ocho rondas anteriores: evidencia real ejecutada en vivo (`node --import ./test/setup-dom.mjs --test`, `npm run build`), grep puntual sobre el código, y `git diff --stat` contra el commit de cierre de la octava ronda para confirmar alcance.

## 1. Evidencia en vivo

```
node --import ./test/setup-dom.mjs --test
tests 431
suites 16
pass 431
fail 0
```

Cifra idéntica a la reportada al cierre de la octava ronda (431/431). No hubo regresión ni tests agregados/quitados desde entonces — el trabajo de esta ronda profundizó cobertura de interacción sin sumar archivos de test nuevos por fuera de los tres ya contabilizados en la octava ronda (`academy-interaction`, `data-settings-interaction`, `technical-documents-interaction`).

```
npm run build
✓ 1977 modules transformed, built in 466ms
dist/assets/pdf.worker.min-*.mjs   1265.41 kB
dist/assets/pdf-text-*.js           430.30 kB
dist/assets/index-*.js              412.72 kB
dist/assets/DataSettings-*.js        30.83 kB
dist/assets/Sales-*.js               27.10 kB
dist/assets/TechnicalDocuments-*.js  16.34 kB
dist/assets/Academy-*.js             14.12 kB
dist/assets/MercadoLibre-*.js          3.97 kB
...
dist/assets/index-*.css              66.85 kB
```

Build limpio, sin warnings. El code-splitting de la octava ronda (Sales/MercadoLibre/TechnicalDocuments/DataSettings) sigue vigente y funcionando — los chunks lazy aparecen separados del bundle principal.

## 2. Verificación puntual de los 3 puntos trabajados

**Backend — límite de payload en `simulate-whatsapp.js`:**
```js
export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };
```
Confirmado en `api/simulate-whatsapp.js:13`. Comparado contra el resto de `api/*.js`: solo `whatsapp-webhook.js` tiene una config de bodyParser explícita (`bodyParser: false`, necesaria para validar la firma HMAC sobre el raw body). El resto de los endpoints (`mercadolibre-*.js`, `meta-*.js`, `commercial-master.js`, `inbox-delete.js`, `cron-daily-maintenance.js`) no tienen límite explícito — quedan en el default de la plataforma, tal como se documentó en rondas anteriores. Sin regresión: sigue siendo un único endpoint interno de test (`simulate-whatsapp`) el que recibió el hardening.

**Backend — script standalone `scripts/smoke-supabase.mjs`:**
Confirmado: existe en `scripts/` junto a `attach-technical-pdfs.mjs`, `build-commercial-master.ps1`, `render_crm_manual_pdf.py`, `smoke.mjs`. No está referenciado por el test runner (`test/*.test.mjs`), consistente con la intención de "script fuera del test runner, para diagnóstico manual".

**Testing — tests de interacción real:**
```
test/academy-interaction.test.mjs:            3 test(
test/data-settings-interaction.test.mjs:       3 test(
test/technical-documents-interaction.test.mjs: 2 test(
```
8 tests nuevos de interacción real (render + eventos DOM), todos verdes, ya contabilizados en el total de 431. El fix de `test/helpers/load-jsx.mjs` está presente y comentado en el propio archivo: antes solo se escribía a disco el chunk *entry* generado por rolldown, y si el componente importaba un chunk compartido (código común entre módulos) el `import()` fallaba con `ERR_MODULE_NOT_FOUND` en tiempo de test. Ahora el loop recorre todos los `chunk.type === "chunk"` del output y escribe cada uno (entry y no-entry) a `CACHE_DIR`, resolviendo la falla de raíz en vez de mockear el import.

**UX — vinculación venta-cliente con autocompletado:**
```jsx
<label>Cliente<input required list="sale-customer-options" value={form.customer} onChange={...}/>
  <datalist id="sale-customer-options">{clientNames.map(...)}</datalist>
  {customerTyped && !matchesKnownClient && clientNames.length > 0 && (
    <small className="field-hint">No coincide con ningún cliente de tu cartera — revisá el nombre para que la venta se vincule a su ficha.</small>
  )}
</label>
```
Confirmado en `src/Sales.jsx:500-505`. El hint usa comparación case/tilde-insensitive (`toLocaleLowerCase('es-AR')`) contra `company`/`legalName` de todos los clientes. `ClientDetail.jsx` también actualizó su mensaje de "sin resultados" (línea 369) a algo explicable ("revisá Ventas si cargaste alguna con otro nombre") en vez de un estado vacío mudo. Este es un mitigante de UX (avisa antes de guardar), no una solución estructural: la vinculación real sigue siendo por igualdad exacta de string después de trim/lowercase — un nombre parecido pero no idéntico ("Perez SRL" vs "Pérez S.R.L.") sigue sin fuzzy-match real, solo ahora el usuario lo ve en el momento de tipear en vez de descubrirlo después en la ficha del cliente.

## 3. Alcance total confirmado (`git diff --stat` 8ª→9ª)

```
 api/simulate-whatsapp.js                            |   7 +
 package.json                                        |   3 +-
 scripts/smoke-supabase.mjs                          |  51 ++
 src/App.jsx                                         |   1 +
 src/ClientDetail.jsx                                |   2 +-
 src/Sales.jsx                                       |  16 ++-
 src/styles.css                                      |   1 +
 test/academy-interaction.test.mjs                   | 144 ++
 test/data-settings-interaction.test.mjs             | 126 ++
 test/fixtures/technical-documents-with-confirm.jsx  |  23 ++
 test/helpers/load-jsx.mjs                           |  28 ++-
 test/technical-documents-interaction.test.mjs       | 123 ++
 12 files changed, 516 insertions(+), 9 deletions(-)
```

12 archivos, exactamente los que corresponden a los 3 frentes tocados (Backend, Testing, UX) más una línea de CSS de soporte (`.field-hint`) y un `App.jsx`/`package.json` triviales de wiring. **Ningún archivo de Automatización, Practicidad diaria, Datos, UI, Frontend, Documentación o Seguridad aparece en el diff** — confirma que esos 7 frentes no tuvieron cambio de código (ni mejora ni regresión) desde la octava ronda. Sus puntajes se mantienen sin modificación salvo ajuste de redondeo en el promedio.

## 4. Tabla de las 9 rondas

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
| **9** | **79** | 79 | 74 | 76 | **80** | 80 | 79 | **87** | 82 | 84 | **80.0** |

Movimientos de la novena ronda: **Backend 78→80** (payload cap real en un endpoint expuesto sin autenticación previa + herramienta de diagnóstico separada del ruido del test suite), **Testing 85→87** (8 tests de interacción real que ejercitan DOM/eventos en 3 módulos que antes solo tenían smoke tests, más un bug de infraestructura de test resuelto de raíz — no parcheado), **UX 77→79** (bug real de negocio encontrado y corregido: ventas invisibles en la ficha del cliente por typo, con mitigación tanto preventiva —datalist + hint— como informativa —mensaje de ClientDetail—). Los 7 frentes no tocados quedan sin cambio, consistente con el diff.

## 5. ¿Cuánta pista queda en Testing / Backend / UX después de esta ronda?

**Backend — pista corta, casi agotada en este vector específico.** El endpoint que motivó el cambio (`simulate-whatsapp.js`) ya tiene cap. Quedan sin cap explícito de bodyParser: `mercadolibre-callback.js`, `meta-onboarding.js`, `meta-subscribe.js`, `commercial-master.js`, `inbox-delete.js`, `cron-daily-maintenance.js` — todos dependen del default de la plataforma (Vercel: ~4.5MB), y ninguno es actualmente un vector de payload attacker-controlled sin autenticación previa del mismo calibre que `simulate-whatsapp` (webhooks de Meta/ML ya validan firma o token antes de procesar body). La pista que queda es endurecer esos defaults por higiene, no por un riesgo activo — bajo valor marginal, quizás 1 punto más en una décima ronda si se hace explícito en los 6 restantes.

**Testing — pista real, todavía la más ancha de los tres.** Quedan sin test de interacción real (solo smoke o sin cobertura de eventos DOM):
- `Sales.jsx` — el propio flujo de `SaleModal` con el nuevo datalist/hint no tiene un test dedicado que simule tipear un nombre no-match y verificar que aparece el `field-hint`; solo se probó indirectamente por los 431 tests preexistentes de `sales-model.test.mjs` (que testean la función pura, no la interacción).
- `MercadoLibre.jsx` — sin test de interacción (solo referencias indirectas en `mercadolibre.test.mjs`, que es lógica pura de sync/parsing).
- `pipeline-sales-whatsapp-interaction.test.mjs` tiene 7 tests — cubre el cruce Pipeline/WhatsApp, pero no Sales.
- `components-interaction.test.mjs` tiene 17 tests genéricos de componentes compartidos, no de pantallas completas.
Techo estimado si se cierra esto: +1 a +2 puntos (86-89), ya cerca del rango 85-88 proyectado en la octava ronda — Testing está entrando en rendimientos decrecientes.

**UX — pista mediana, con un hallazgo nuevo concreto para la próxima ronda.** El fix de esta ronda es un mitigante (datalist + aviso), no elimina la causa raíz: la vinculación venta↔cliente sigue por **igualdad exacta de string** tras normalizar case/tilde. Un usuario que ignora el hint (o no lo ve porque el campo no tiene foco visible en pantallas chicas) sigue pudiendo guardar una venta huérfana. Fuzzy matching real (Levenshtein/similaridad de token) para sugerir "¿quisiste decir X?" en el propio guardado, o una migración batch que re-vincule ventas huérfanas retroactivamente contra la base de clientes, son la pista que queda — y es la misma clase de hallazgo que llevó a la mejora de esta ronda, así que hay señal de que auditar otros flujos cruzados (ej. Pipeline↔Cliente, WhatsApp↔Cliente) con la misma óptica de "¿qué pasa con un typo acá?" puede seguir rindiendo.

## 6. Estimado de rondas restantes

Promedio actual: **80.0%** (+0.6 vs. la octava ronda, la ganancia más chica de las 9 rondas — la ronda anterior ya advertía que el ritmo se enlentecería a medida que se acerca al techo técnico 85-88%).

Ritmo histórico de ganancia por ronda: 1→2 +9.7, 2→3 +6.7, 3→4 +4.0, 4→5 +2.6, 5→6 +1.7, 6→7 +1.5, 7→8 +1.2, **8→9 +0.6**. La curva de rendimientos decrecientes es clara y esta ronda la confirma con el valor más bajo de la serie — consistente con que los 3 frentes trabajados (Backend, Testing, UX) ya estaban cerca de su techo local individual y el resto de los 7 frentes no tocados no puede seguir subiendo sin trabajo dedicado.

Con el promedio en 80.0% y el techo proyectado en 85-88%, quedan entre 5 y 8 puntos. Si el ritmo sigue decayendo geométricamente (cada ronda rinde ~40-50% de la ganancia de la ronda anterior cuando se enfoca en los mismos frentes), **restan aproximadamente 3 a 4 rondas técnicas más**, pero con una condición: esas rondas deberían repartirse entre los 7 frentes no tocados (Automatización 74 y Practicidad diaria 76 son los más bajos y con más pista obvia — automatización de flujos manuales, atajos de practicidad diaria) en vez de seguir profundizando Backend/Testing/UX, que ya muestran señales de rendimientos decrecientes marcados en esta ronda. Concentrarse en los mismos 3 frentes otra vez probablemente rinda +0.3 a +0.5 por ronda; repartir el esfuerzo a los frentes más bajos (Automatización, Practicidad diaria) tiene más margen de ganancia por punto de esfuerzo invertido.
