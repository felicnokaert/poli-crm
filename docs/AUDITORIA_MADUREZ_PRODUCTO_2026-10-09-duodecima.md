# Auditoría de madurez de producto — duodécima ronda (2026-10-09)

Mismo método que las rondas anteriores: evidencia ejecutada en vivo, lectura de
código y `git` para confirmar alcance. Cierre de la 11ª ronda: 84,4 %. Esta
ronda tiene dos partes: **A** (cerrar Frontend con medición) y **B** (revisión
de Seguridad, el único frente que había bajado).

> Los puntajes de la sección 4 son una estimación de quien ejecutó la ronda;
> Felipe los valida o los corrige.

## 1. Evidencia en vivo

```
pnpm test   -> tests 550 / pass 550 / fail 0
pnpm build  -> OK
```

- 458 (cierre 11ª) -> 548 (línea base de hoy) -> 550 (+2 tests de esta ronda).
- Una corrida completa dio 1 falla intermitente en `components-smoke`
  ("Clients renderiza la lista…"). No se reprodujo: 3 corridas aisladas y una
  corrida completa posterior pasaron, y sin los cambios de esta ronda también
  pasa. Queda anotado como posible flaky; si reaparece, abrir un caso aparte.

## 2. Parte A — Frontend / bundle

- **`pdfjs-dist` ya estaba separado** con import dinámico (`Sales.jsx`,
  `technical-documents-repo.mjs`); el chunk de entrada no lo contiene. La
  recomendación de las auditorías 10ª y 11ª ("bundle de PDF") ya estaba resuelta.
- **Trabajo real:** vistas y modales de `App.jsx` pasaron a `React.lazy` +
  `Suspense` (PR #1, mergeado, `14d2748`). Quedan estáticos Login, Dashboard,
  Tasks e Interactions (los comparten Dashboard y ClientDetail).

| | Antes | Después |
|---|---|---|
| Chunk de entrada `index-*.js` | 434,96 kB (gzip 132,44) | **358,80 kB (gzip 113,09)** |
| `pdf-text-*.js` / `pdf.worker` (lazy) | 430,30 kB / 1.265 kB | sin cambio |

Entrada: -76 kB (-14,6 %). La 11ª auditoría registró 418,45 kB; la línea base de hoy
(434,96 kB) es mayor, y no se investigó el origen de esa diferencia.

- **Pendiente de verificación humana:** la lista "a revisar a mano" del PR #1
  (spinner de primera carga, ficha de cliente, modales, bandeja con datos
  reales). Producción quedó en Ready en Vercel.
- **Siguiente paso posible, no recomendado ahora:** mover Dashboard/Tasks/
  Interactions a lazy exige reestructurar a cambio de poco.

## 3. Parte B — Seguridad

Alcance: historial git, `vercel.json`, los 10 endpoints de `api/`, `lib/`.

### Corregido en esta ronda

1. **`api/inbox-delete.js` — autorización (media).** Aceptaba a *cualquier*
   usuario autenticado de Supabase, sin chequear dominio, y borraba con la
   service key. El resto de los endpoints exige correo corporativo. Ahora usa
   `authenticatedCorporateUser` (`lib/corporate-auth.mjs`). Riesgo real solo si
   el registro de Supabase admite cuentas externas. Test nuevo.
2. **Comparación de secretos en tiempo constante (baja).** `CRON_SECRET`,
   `TASKS_API_SECRET` y `COPILOT_SIMULATOR_TOKEN` se comparaban con `===`. Ahora
   usan `safeEqual` (`lib/safe-equal.mjs`, mismo criterio que la firma de Meta).
   Test nuevo.

### Verificado sin hallazgo

- Sin `.env` ni secretos versionados en el historial (`.env*` ignorado,
  `.env.example` sin valores). La búsqueda de patrones (`sk-ant-`, `sk_live`,
  `AKIA`, `ghp_`, bloques `-----BEGIN`) no devuelve nada. La service key solo
  se lee desde `process.env` en `api/` y `lib/`.
- Webhook de WhatsApp: firma HMAC en tiempo constante, tope de body, verify token.
- Cabeceras en `vercel.json`: HSTS, `nosniff`, `X-Frame-Options`, CSP,
  `Referrer-Policy`, `Permissions-Policy`; `/api/*` con `no-store`.
- `cron`, `tasks-intake` y `simulate`: fail-safe sin secreto configurado.
  `meta-*`, `commercial-master`: usuario corporativo + validación de entrada.

### Observaciones sin cambiar (decisión o baja prioridad)

| # | Observación | Severidad | Sugerencia |
|---|---|---|---|
| 1 | `scripts/attach-technical-pdfs.mjs` trae la anon key de Supabase como valor por defecto. Es rol `anon` (público por diseño, protegido por RLS), pero el repo es público. | Baja | Quitar el valor por defecto y exigir la variable de entorno. |
| 2 | CSP general: `style-src 'unsafe-inline'` e `img-src https:`. | Baja | Aceptable; endurecer solo si se migra el estilo inline. |
| 3 | `connect-src` aún lista `api.mercadolibre.com` aunque la integración ML se retiró. | Baja | Quitarlo. |
| 4 | `inbox-delete` borra por `event_id` sin acotar al workspace del usuario. | Media, depende del modelo | Confirmar si la bandeja es compartida por diseño. |
| 5 | Sin rate limiting en endpoints (todos van detrás de bearer/firma). | Baja | No hace falta hoy. |

Sin tocar: 1 y 3 son cambios de bajo riesgo, pero 3 modifica la CSP de
producción y 1 un script operativo, así que quedan para decisión de Felipe.
El punto 4 es una decisión de modelo de datos.

## 4. Puntajes (estimación)

| Frente | 11ª | 12ª | Motivo |
|---|---|---|---|
| Frontend | 80 | 83 | Entrada -14,6 %, PDF ya aislado. |
| Seguridad | 83 | 85 | Autorización de `inbox-delete` y secretos en tiempo constante. |
| Resto | — | sin cambio | Sin trabajo esta ronda. |

Promedio estimado: **84,9 %** (de 84,4 %). El techo proyectado sigue en 85–88 %.

## 5. Lo que no mide este número

Sigue siendo un índice técnico, no adopción. El riesgo abierto de mayor
impacto sigue fuera del código: la caída de ~85 % en checkout/conversión de
Shopify sin dueño asignado.
