# Auditoría de Seguridad — Poliplast Sales Copilot
**Fecha:** 2026-09-12
**Alcance:** revisión de código estático (`api/`, `lib/`, `src/`), configuración (`vercel.json`, `.gitignore`, `.env.example`), historial de git, y estado real de la base de datos vía Supabase MCP (RLS, policies, advisors). No se ejecutó pentest dinámico contra producción ni fuzzing de endpoints.
**Método:** solo lectura. No se modificó código ni configuración como parte de esta auditoría.

---

## Resumen ejecutivo

**No se encontró ninguna vulnerabilidad crítica explotable de inmediato** (sin credenciales) en el código revisado. La superficie pública (webhook de WhatsApp, callback de OAuth de Mercado Libre, endpoint de simulación) está protegida con verificación criptográfica correcta (HMAC con comparación de tiempo constante, estado OAuth firmado con expiración). Los 25 endpoints server-side y las 25 tablas de Supabase con datos reales tienen control de acceso activo.

Los hallazgos son de **higiene y endurecimiento**, no de explotación directa. El de mayor impacto real es la falta de rate limiting a nivel aplicación en endpoints públicos (webhook, simulador), que hoy dependen enteramente de los límites de infraestructura de Vercel/Meta.

---

## 1. Secretos y variables de entorno — **BIEN**

- Grep exhaustivo del repo (`eyJ...` JWT, `sk_live`/`sk_test`, `AIza...`, bloques `-----BEGIN`) no encontró ninguna clave, token o secreto hardcodeado en código fuente, tests, docs o `.env.example`.
- Todo el acceso a `SUPABASE_SERVICE_ROLE_KEY`, `META_APP_SECRET`, `MELI_CLIENT_SECRET`, `MELI_TOKEN_ENCRYPTION_KEY`, `WHATSAPP_VERIFY_TOKEN`, `COPILOT_SIMULATOR_TOKEN`, etc. pasa por `process.env` dentro de `api/*.js` y `lib/*.mjs`. Confirmado que ninguno de estos nombres aparece en `src/` (que solo usa `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, correctamente públicas porque están protegidas por RLS).
- `.gitignore` excluye `.env` y `.env.*` (con excepción explícita de `.env.example`). `git log --all -- .env .*.env` no devuelve ningún commit — el archivo nunca fue versionado, ni siquiera en un commit viejo squasheado o revertido.
- **Detalle menor de higiene:** `.env.example` (líneas 9-10) trae valores reales pre-rellenados para `WHATSAPP_PENOSIL_PHONE_ID` y `WHATSAPP_JUAN_PHONE_ID`. No son credenciales (son IDs de enrutamiento de Meta, no secretos — no otorgan acceso a nada por sí mismos), pero conceptualmente un `.env.example` no debería llevar valores de producción. Bajo riesgo, fácil de limpiar.

## 2. Autenticación y autorización — **BIEN, con una nota de mantenibilidad**

Cómo se loguea un usuario: Supabase Auth (email/password u OAuth, gestionado por `@supabase/supabase-js` en el cliente). Las funciones serverless no manejan sesiones directamente — reciben el JWT del usuario en el header `Authorization: Bearer <token>` y lo validan contra `GET {SUPABASE_URL}/auth/v1/user` usando la `SERVICE_ROLE_KEY` como `apikey`. Si Supabase confirma el token y el email devuelto termina en `@grupopoliplast.com.ar` (o el back-up `felipecnokaert@gmail.com`), se concede acceso.

Revisé los 11 archivos de `api/`:

| Endpoint | Protección | Veredicto |
|---|---|---|
| `cron-daily-maintenance.js` | `Authorization: Bearer {CRON_SECRET}`, **fail-safe**: si `CRON_SECRET` no está seteado, el endpoint nunca autoriza nada (línea 16: `if (!secret) return false`) | Bien |
| `whatsapp-webhook.js` | HMAC SHA-256 sobre el body crudo (`verifyMetaSignature`, comparación con `crypto.timingSafeEqual`) | Bien |
| `mercadolibre-callback.js` | Estado OAuth firmado con HMAC + nonce + expiración de 10 min (`verifyOAuthState`) | Bien |
| `simulate-whatsapp.js` | `Authorization: Bearer {COPILOT_SIMULATOR_TOKEN}`, fail-closed si no está seteado (línea 8: `!expected \|\| received !== expected`) | Bien — ver nota de riesgo real en sección 4 |
| `commercial-master.js` | Sesión Supabase + email corporativo + `canAccessCommercialMaster` (chequeo de canal adicional) | Bien |
| `mercadolibre-accounts.js`, `mercadolibre-connect.js`, `mercadolibre-sync.js` | Sesión Supabase + email corporativo vía `lib/corporate-auth.mjs` | Bien |
| `meta-onboarding.js`, `meta-subscribe.js`, `inbox-delete.js`, `readiness.js` | Sesión Supabase + email corporativo, **implementación local duplicada** (no importan `lib/corporate-auth.mjs`) | Bien funcionalmente, ver nota abajo |
| `health.js` | Sin autenticación — pero solo devuelve booleanos de "¿está configurada esta variable de entorno?", nunca valores ni datos | Bien — diseño intencional y correcto |

**Nota de mantenibilidad (no es una vulnerabilidad hoy, pero es una fuente probable de una futura):** la función `authenticatedUser`/`allowedEmail` (verificación de sesión + email corporativo) está copiada casi idéntica en `commercial-master.js`, `inbox-delete.js`, `meta-onboarding.js`, `meta-subscribe.js` y `readiness.js`, en vez de importar la versión centralizada que ya existe en `lib/corporate-auth.mjs` (usada correctamente por los 3 endpoints de Mercado Libre). Hoy las 6 copias están sincronizadas, pero si mañana hay que revocar el acceso de alguien o cambiar el dominio permitido, es fácil actualizar 2 de 6 lugares y dejar 4 endpoints con la regla vieja. Esto es exactamente el tipo de deriva que un pentest no detecta pero que causa incidentes reales seis meses después.

## 3. RLS de Supabase — **BIEN, confirmado con consulta en vivo**

No asumí que la auditoría de madurez anterior tenía razón — corrí `list_tables` (verbose) y `pg_policies` directamente contra el proyecto (`nghwmtccpovrdtzvllwe`).

- **Las 25 tablas de `public`** con datos reales (`accounts`, `contacts`, `conversations`, `tasks`, `whatsapp_events`, `workspace_states`, `catalog_products`, `variant_prices`, `technical_documents`, `inventory_*`, `commercial_rules`, etc.) tienen `rls_enabled = true`. Confirmado, no supuesto.
- Las policies usan dos funciones `SECURITY DEFINER` (`is_poliplast_crm_user()`, `is_poliplast_crm_admin()`) que resuelven el email desde `auth.jwt()`, más `user_allowed_channels()` para segmentar WhatsApp por canal (`general`/`penosil`/`juan`) según el email del usuario. El patrón es razonable: lectura de catálogo/inventario para "usuario", escritura de costos/precios/stock solo para "admin", y `whatsapp_events`/`workspace_states` filtrados por canal permitido o por `auth.uid()`.
- **Hallazgo real (bajo riesgo, ya en modo fail-closed):** `mercadolibre_accounts` y `mercadolibre_items` tienen RLS activado pero **cero policies**. Esto no es un agujero — con RLS on y sin policies, Postgres niega todo acceso a `anon`/`authenticated` por defecto (fail-closed), y hoy esas tablas solo se leen/escriben desde `api/mercadolibre-*.js` con la `SERVICE_ROLE_KEY`, que ignora RLS. Es decir: hoy nadie que no sea el backend puede tocarlas, que es lo correcto. El problema es que **si en el futuro alguien agrega una lectura directa desde el cliente** (por ejemplo, para mostrar el estado de sincronización en el front sin pasar por `mercadolibre-accounts.js`), fallará silenciosamente en lugar de fallar por falta de policy explícita — hay que recordar crear la policy entonces, no es automático.
- El advisor de Supabase marcó además `Leaked Password Protection Disabled` (verificación contra HaveIBeenPwned) — está apagada. Es un toggle de un clic en el dashboard de Supabase Auth, cero costo de implementación, mejora real contra reuso de contraseñas filtradas del staff.
- El advisor también marcó las 3 funciones `SECURITY DEFINER` como ejecutables por `anon`/`authenticated` vía RPC (`is_poliplast_crm_user`, `is_poliplast_crm_admin`, `user_allowed_channels`). Revisé el código SQL de las tres: solo leen `auth.jwt() ->> 'email'` y devuelven un booleano o un array de strings — no exponen ni modifican datos de otras tablas. Ejecutarlas sin estar logueado solo te dice "no, no tenés permiso", lo cual no es información sensible. Es una advertencia de higiene (el patrón recomendado es `SECURITY INVOKER` cuando no hace falta elevar privilegios) pero no vi cómo explotarla para leer datos ajenos.

## 4. Superficie de ataque de webhooks públicos

**`api/whatsapp-webhook.js`** — **BIEN, con una nota menor**
- Verificación GET (handshake de suscripción de Meta): compara `hub.verify_token` con `===` de string plano (línea 17), no con `timingSafeEqual`. En teoría es una comparación por timing, en la práctica el atacante necesitaría medir microsegundos contra un endpoint de red pública para adivinar un token largo carácter por carácter — de explotabilidad casi nula, pero la comparación POST (HMAC del body) sí usa `timingSafeEqual` correctamente, así que sería consistente aplicarlo también aquí.
- Verificación POST: `verifyMetaSignature` recalcula el HMAC-SHA256 del body crudo con `META_APP_SECRET` y compara con `crypto.timingSafeEqual` — correcto. Si la firma falla, devuelve 401 sin procesar nada.
- **Qué pasa si falla la verificación:** simplemente 401, no se persiste nada, no hay side-effects. Correcto.
- **Rate limiting:** no hay ninguno a nivel aplicación. Cualquiera puede mandar POSTs al endpoint; los que no tengan firma válida son rechazados rápido (barato de rechazar), pero no hay throttling explícito. En la práctica Vercel tiene límites de funciones serverless que amortiguan esto, pero es un control ausente, no delegado a propósito.

**`api/mercadolibre-callback.js`** — **BIEN**
- Valida el `state` con HMAC + `timingSafeEqual`, además de nonce aleatorio de 16 bytes y expiración de 10 minutos (`lib/mercadolibre.mjs` líneas 44-52). Un state reusado o vencido lanza excepción y no persiste nada.
- Los tokens de Mercado Libre se cifran con AES-256-GCM antes de guardarse en Supabase (`sealToken`/`openToken`) — no se guardan en texto plano ni siquiera con `SERVICE_ROLE_KEY` de por medio. Buena práctica poco común de ver en este tipo de integraciones.

**`api/simulate-whatsapp.js`** — **mejorable / riesgo real acotado**
- Requiere `Authorization: Bearer {COPILOT_SIMULATOR_TOKEN}` y falla cerrado si la variable no está seteada. **No está expuesto en el frontend** (confirmé que `COPILOT_SIMULATOR_TOKEN` y `/api/simulate-whatsapp` no aparecen en ningún archivo de `src/` — es un endpoint pensado para probarse manualmente con curl/Postman, no algo que el CRM llame desde el navegador).
- El riesgo real: **si `COPILOT_SIMULATOR_TOKEN` queda configurado en producción** (no solo en preview/dev) y ese token se filtra o se adivina, cualquiera puede inyectar eventos de WhatsApp falsos indistinguibles de mensajes reales de clientes (mismo endpoint `persistEvents`, misma tabla `whatsapp_events`) — esto podría contaminar la bandeja de un vendedor con conversaciones falsas, o (más preocupante) esconder eventos reales entre ruido inyectado. No es explotable sin el token, pero es la única ruta pública que inserta datos operativos sin pasar por Meta. Recomendación operativa (no la implemento, es decisión de Felipe): confirmar que `COPILOT_SIMULATOR_TOKEN` **no esté seteado en el entorno de producción de Vercel**, solo en preview/desarrollo — así el endpoint queda 401 fail-closed en el dominio real sin tocar código.

## 5. Inyección y sanitización — **BIEN**

Revisé todos los `fetch` a la REST API de Supabase en `api/*.js` y `lib/*.mjs`:
- Todos los bodies van como `JSON.stringify(...)` a `Content-Type: application/json` — no hay concatenación de SQL en ningún lado (no se usa `pg`/`knex`/queries raw, todo es REST de PostgREST).
- Los parámetros que sí se interpolan en la URL (por ejemplo `workspace_key=eq.${encodeURIComponent(workspaceKey)}` en `cron-daily-maintenance.js:30`, `event_id=in.(...)` en `inbox-delete.js:16-17`, `account_key=eq.${encodeURIComponent(accountKey || '')}` en `mercadolibre-sync.js:67`) pasan siempre por `encodeURIComponent`, que neutraliza intentos de PostgREST filter injection vía caracteres especiales de URL.
- `inbox-delete.js` limita a `MAX_IDS = 500` y dedupea con `Set` antes de construir el filtro `in.(...)` — buena defensa contra bodies gigantes.
- No encontré `dangerouslySetInnerHTML` ni `eval(` en todo `src/`.

## 6. Dependencias (`npm audit` / `pnpm audit`) — **no se pudo ejecutar en este entorno**

El repo usa `pnpm-lock.yaml` pero este worktree no tiene `pnpm` instalado ni `node_modules`, y tanto `npm audit` (requiere lockfile de npm) como `npx pnpm audit` fallaron en el sandbox (`ENOLOCK` / acceso denegado al descargar pnpm). **No pude correr el audit real** — es una limitación de este entorno de auditoría, no una verificación completada.

**Acción pendiente para Felipe:** correr `pnpm audit` (sin `--fix`) en su máquina y pegar el resultado. Como dato de contexto: `package.json` declara solo 6 dependencias directas (`@supabase/supabase-js`, `@vitejs/plugin-react`, `lucide-react`, `pdfjs-dist`, `react`, `react-dom`, `vite`) — superficie de terceros chica en comparación con un proyecto típico, lo cual limita el radio de impacto de cualquier CVE que aparezca.

**Hallazgo de higiene:** `@vitejs/plugin-react`, `lucide-react`, `react`, `react-dom` y `vite` están fijados como `"latest"` en vez de un rango semver o versión exacta (línea 14-19 de `package.json`). Esto significa que cada `pnpm install` limpio puede traer una versión distinta sin que nadie lo decida explícitamente — no es un hueco de seguridad hoy, pero es la clase de patrón que en un ataque de supply-chain (paquete comprometido publicado como "latest") no da ningún margen de reacción, porque no hay pin que revisar antes de actualizar.

## 7. CSP y headers (`vercel.json`) — **BIEN, coherencia verificada**

CSP actual:
```
default-src 'self'; script-src 'self' https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com https://www.facebook.com https://api.mercadolibre.com; frame-src https://www.facebook.com https://web.facebook.com; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
```
Contrastado contra lo que la app efectivamente carga:
- `script-src https://connect.facebook.net` — coincide con `src/meta-onboarding.js:15` (`script.src = 'https://connect.facebook.net/es_LA/sdk.js'`, el SDK de onboarding de WhatsApp Embedded Signup de Meta).
- `style-src ... https://fonts.googleapis.com` y `font-src https://fonts.gstatic.com` — coincide con el `@import` de Google Fonts en `src/styles.css:1`.
- `connect-src https://*.supabase.co wss://*.supabase.co` — coincide con el cliente de Supabase (incluye websockets para realtime, si se usa). `https://graph.facebook.com https://www.facebook.com` y `https://api.mercadolibre.com` — coinciden con las llamadas server-side (esas llamadas no las hace el navegador del cliente directamente salvo el postMessage de onboarding, que usa `frame-src`/verificación de `event.origin` en `meta-onboarding.js:28`).
- No encontré ningún script o conexión que la app cargue y que el CSP no permita, ni ningún permiso de CSP obviamente sobrante (cada entrada de `connect-src`/`script-src`/`frame-src` tiene un uso real identificado en el código).
- `style-src 'unsafe-inline'` está presente — es común y aquí parece necesario porque React normalmente inyecta estilos inline; es una relajación estándar del CSP, no un error, pero vale que Felipe sepa que reduce algo la protección contra XSS por estilos si alguna vez se agregara HTML no confiable a la página.

## 8. Manejo de datos personales — **BIEN, sin hallazgos obvios**

- Búsqueda de `console.log/error/warn` que impriman teléfono, email o datos de cliente en texto: solo hay un `console.error` en todo `api/` (`cron-daily-maintenance.js:63`), y loguea el objeto `error`, no datos de clientes.
- Los webhooks de WhatsApp guardan `raw_payload` completo (mensaje crudo de Meta, incluye número de teléfono y texto) en `whatsapp_events` — esperable para un CRM que necesita el historial de conversación, no es un manejo indebido, pero es dato sensible que vive en la tabla y hereda su exposición del RLS de esa tabla (ya verificado en sección 3: filtrado por canal permitido).
- No se encontró logging de PII hacia servicios externos, ni telemetría de terceros (no hay Sentry/analytics de terceros configurado que pudiera estar recibiendo datos de clientes sin que el equipo lo note).

---

## Top 5 para resolver si hay tiempo, por riesgo real × facilidad

| # | Ítem | Tipo | Riesgo real | Esfuerzo |
|---|---|---|---|---|
| 1 | Confirmar que `COPILOT_SIMULATOR_TOKEN` no esté seteado en el entorno de **producción** de Vercel (solo preview/dev) | **Hallazgo real** — única ruta pública que inyecta datos operativos sin pasar por Meta | Medio si el token se filtrara | Trivial — revisar variables de entorno en Vercel, no toca código |
| 2 | Activar "Leaked Password Protection" en Supabase Auth | Hallazgo real (menor) — hoy nadie chequea si el staff usa una contraseña filtrada | Bajo (acceso interno, pocos usuarios) | Trivial — un toggle en el dashboard de Supabase |
| 3 | Centralizar la verificación de sesión/email corporativo (hoy duplicada en 6 archivos) usando `lib/corporate-auth.mjs` en los 5 que la reimplementan localmente | Higiene, no explotación hoy | Se vuelve real el día que alguien actualice la regla en un solo lugar y no en los otros 4 | Bajo-medio — refactor mecánico, sin cambio de comportamiento |
| 4 | Usar `crypto.timingSafeEqual` también en la comparación de `hub.verify_token` (GET handshake) en `api/whatsapp-webhook.js:17`, igual que ya se hace en la verificación HMAC del POST | Higiene defensiva | Muy bajo (ataque de timing remoto es difícil en la práctica) | Trivial — una línea |
| 5 | Correr `pnpm audit` real (no se pudo en este sandbox) y fijar versiones exactas en vez de `"latest"` en `package.json` | Higiene de cadena de suministro | Depende de qué aparezca en el audit — desconocido hasta correrlo | Bajo — correr el comando y pinnear versiones |

**Nota de honestidad:** el punto 5 es el único donde esta auditoría queda incompleta — no logré ejecutar el audit de dependencias en este entorno aislado. Todo lo demás en esta lista fue confirmado leyendo código real o consultando el estado real de la base, no supuesto.
