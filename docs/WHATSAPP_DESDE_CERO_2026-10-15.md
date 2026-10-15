# WhatsApp "desde cero" para recibir mensajes en el CRM de Poliplast y diagnóstico de webhooks caídos

Fecha: 2026-10-15. Investigación hecha SOLO con búsqueda web. **WebFetch no funcionó** (`getaddrinfo ENOTFOUND developers.facebook.com`), así que no pude leer la documentación de Meta completa. Solo vi extractos y resúmenes de los resultados de búsqueda.

Leyenda:
- **[V]** = el resultado de búsqueda citó una página oficial de Meta (el extracto es lo único que leí, no la página entera).
- **[V-web]** = fuente secundaria (BSP, blog, foro, issue de GitHub), con URL citada.
- **[NV]** = no verificada. Conocimiento previo o inferencia mía.

Las rutas de menú del Business Manager y de developers.facebook.com **no pude verificarlas** y cambian seguido. Todas las rutas de menú de este documento son [NV]: usalas como guía y adaptalas a lo que veas en pantalla.

---

## 0. Resumen ejecutivo

1. Con tus síntomas, la hipótesis más probable NO es el endpoint (vos ya lo verificaste y el "Probar" llega). Lo más probable es que **el número ya no esté entregando eventos a la Cloud API**. Hay dos variantes:
   - **(a)** coexistencia desconectada, número migrado o re-registrado, o número quitado de la WABA el 13/10.
   - **(b)** un override de callback a nivel de número o de WABA que manda los eventos a otra URL.
2. Los dos "Deleted User" del 13/10 son la pista temporal más fuerte. Falta mirar quién/qué los generó (sección 3).
3. Recomendación de arquitectura (sección 2): **Cloud API propia con número DEDICADO** (que no sea el del celular). Es la única opción oficial, estable y sin riesgo de bloqueo que cumple "solo recibir". Plan B: **BSP con plan de bajo costo** (360dialog u otro). Recibir no cuesta por mensaje en la Cloud API, pero hay discrepancias de precios (sección 2).
4. Si necesitan mantener el número actual en el celular, la única vía oficial es la **coexistencia**. Es la que más se desconecta sin aviso (regla de abrir la app cada ~13 días).

---

## 1. Causas conocidas por las que Meta deja de entregar webhooks

### 1.0 Hechos de base

- [V] La página oficial de webhooks de WhatsApp dice que, si tu endpoint responde algo distinto de HTTP 200 o no se puede entregar, Meta reintenta con frecuencia decreciente hasta 7 días y puede haber duplicados. (developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/, extracto en búsqueda)
- [V-web] Hookdeck dice que después de 7 días de fallas la notificación se descarta. (https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [NV] **No encontré ninguna fuente que confirme que Meta desactive automáticamente el webhook de WhatsApp por fallas del endpoint.** Un blog (Blueticks) habla de "deshabilitar tras 8 entregas fallidas", pero era de otro proveedor. La búsqueda lo marcó como no aplicable a Meta.
- [V] Orden de prioridad del destino del webhook: primero el override del **número**, luego el de la **WABA**, luego el **callback de la app**. (https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/, extracto)
- [V-web] Meta permite UN solo callback por app, y la WABA debe estar suscrita a la app (`POST /{waba-id}/subscribed_apps`). Sin suscripción, no hay webhooks. (foros de Meta, Medium; ver sección 4)

### 1.1 Causas, ordenadas por probabilidad para TU caso

Contexto: dejó de funcionar el 13/10 a las 17:43, no llega nada, el "Probar" sí llega, el endpoint está sano, `subscribed_apps` fue recreado sin efecto, el número figura "Conectado", y hay dos "Deleted User" ese día.

| # | Causa | Prob. | Por qué encaja o no |
|---|---|---|---|
| 1 | **Coexistencia desconectada o el número dejó de estar en la Cloud API** (el número volvió a ser solo de la app del celular, o pasó a otra plataforma) | Alta | Cortaría todo de golpe. Un "Conectado" en el panel puede estar desactualizado. Un "Reparar" de `subscribed_apps` no ayuda si el número ya no está en la Cloud API. |
| 2 | **Override de callback a nivel número o WABA** apuntando a otra URL (o a una vieja) | Media-Alta | Si alguien configuró un override el 13/10, los eventos van allá y el webhook de la app no recibe nada, pero el "Probar" del panel (que usa la app) sí llega. Encaja con tu síntoma. |
| 3 | **Usuario/usuario del sistema/rol eliminado** ("Deleted User"): la app o el activo (WABA) quedó sin un admin válido, o se rompió la asignación del activo a la app | Media-Alta | Coincide con el log. Si se borró el usuario que era el admin/dueño de la app o quien conectó el número, pueden romperse permisos. |
| 4 | **Número re-registrado o migrado** (otro `/register`, otro BSP, o la app del celular lo tomó) | Media | Comparte síntomas con la 1. |
| 5 | **Suscripción de la WABA a la app** caída o apuntando a otra app | Baja ahora | Ya la recreaste con "Reparar" sin efecto. Igual verificá con GET que figure TU app id. |
| 6 | **Campo `messages` no suscrito** en la app | Baja | Dijiste que sigue configurado. Re-verificá también por API (sección 3). |
| 7 | **App en modo Desarrollo / app no Live** | Baja-Media | Si el 13/10 la app pasó a modo desarrollo o cambió el estado, solo se entregan eventos de números de prueba. [V-web] https://richautomate.in/blog/whatsapp-webhook-not-receiving-messages-india-2026 (resultado de búsqueda) |
| 8 | **Política, violación o restricción de cuenta/negocio** | Baja-Media | Hay que mirar "Calidad de la cuenta" y notificaciones de política en Business Manager. |
| 9 | **Webhook del endpoint rechazando/URL con `+` o caracteres raros** | Baja | Tu endpoint responde bien. Anecdótico: Chatwoot issue #14738, la URL con `+` llegaba como `%20`. [V-web] https://github.com/chatwoot/chatwoot/issues/14738 |
| 10 | **Límites de calidad / método de pago faltante** | Baja | Afectan el ENVÍO (y mensajes de pago), no la recepción de mensajes entrantes. [NV] No encontré fuente que diga que la falta de método de pago corte webhooks de entrada. Tenelo igual como "a descartar" (ver 1.2, punto 8). |
| 11 | **Caída/incidente de Meta** | Muy baja a 2 días | Revisá el estado de la plataforma (hilos "Partial Outage" en foros de Meta). [V-web] https://developers.secure.facebook.com/community/threads/879763774110057 |

### 1.2 Detalle por causa: cómo confirmarla y cómo arreglarla

**Prueba de oro (hacela primero, 2 minutos):** mandá un mensaje desde OTRO teléfono al +54 9 11 5262-7555. Mirá si aparece en la app WhatsApp Business del celular.
- Aparece en el celular y no llega webhook: el número está activo en la app. Sospechá causa 1 o 4 (coexistencia/registro).
- No aparece en el celular tampoco: sospechá cuenta/número restringido (causa 8) o desregistrado.

**1. Coexistencia desconectada**
- [V-web] Varias fuentes (BSP) dicen que la app WhatsApp Business del celular debe abrirse al menos una vez cada ~13 días para mantener la coexistencia. Un proveedor dice que Meta desconecta tras ~14 días de inactividad del dispositivo principal. Las fuentes difieren (13 vs ~14). (https://dualhook.com/docs/coexistence, https://docs.360dialog.com/docs/resources/phone-numbers/coexistence, resultados de búsqueda)
- [V-web] Un proveedor afirma que Meta envía una notificación de desconexión con el motivo (inactividad, cambio de dispositivo, desconexión de cuenta). [NV] No pude confirmarlo en Meta. Buscá en tus logs de Vercel/Supabase eventos recientes que no sean `messages` (por ejemplo `account_update`), si es que tu endpoint los recibe.
- Cómo confirmar (rutas [NV]): en el celular, app WhatsApp Business > Ajustes > Cuenta > Plataforma de WhatsApp Business (o similar). Debe indicar que el número está conectado a una plataforma. En el Business Manager > Cuentas > Cuentas de WhatsApp > tu WABA > Números de teléfono: mirá el estado y la "plataforma".
- Por API (token de sistema de diagnóstico, [NV] los nombres exactos de campos): `GET /{phone-number-id}?fields=status,platform_type,account_mode,code_verification_status,quality_rating,name_status,throughput`. Un `platform_type`/estado distinto al esperado indica que el número ya no está en la Cloud API.
- Arreglo: abrir la app del celular y reconectar mediante el flujo de Embedded Signup / "conectar" de coexistencia. Si el número se desvinculó, hay que re-onboardearlo (puede implicar que la historia no se re-sincronice).

**2. Override de callback**
- Confirmar por API: `GET /{waba-id}?fields=webhook_configuration` y `GET /{phone-number-id}?fields=webhook_configuration` (el campo `webhook_configuration` con `application`/`whatsapp_business_account`/`phone_number` existe en la API, [NV] verificalo en pantalla). Si aparece una URL que no es `https://poli-crm.vercel.app/api/whatsapp-webhook`, es la causa.
- Arreglo: borrar el override (según la doc de overrides: `POST /{phone-number-id}` con `webhook_configuration.override_callback_uri` vacío, [NV] confirmá el cuerpo exacto) o ponerlo en tu URL.

**3. Usuario eliminado / activos sin administrador**
- Confirmar: Business Manager > Configuración del negocio > Seguridad / Registro de actividad (o "Historial del negocio", [NV]) y abrí los dos eventos "Deleted User" del 13/10 17:43. Anotá qué activo o permiso se modificó justo antes/después.
- Confirmar: Configuración del negocio > Usuarios > Personas / Usuarios del sistema. Revisá que tu app de desarrollador y la WABA tengan un admin válido, y que la app esté asignada a la WABA (Cuentas > Cuentas de WhatsApp > Personas/Aplicaciones).
- Arreglo: re-asignar la WABA y la app con control total a un usuario activo. Regenerar el token. Re-suscribir `subscribed_apps`.

**4. Número re-registrado / migrado**
- Confirmar: el historial de la WABA en el Business Manager y los eventos de "migración" o "registro". Por API: `GET /{phone-number-id}?fields=status,code_verification_status`.
- Arreglo: re-registrar el número a la Cloud API (`POST /{phone-number-id}/register` con PIN), solo si es un número DEDICADO. En coexistencia, no se registra de esa forma: se reconecta por Embedded Signup.

**5. `subscribed_apps` de la WABA**
- Confirmar: `GET https://graph.facebook.com/<version>/{waba-id}/subscribed_apps` y verificar que aparezca el ID de TU app (no otra app). [V-web] Los foros indican que esta es la causa más común, y que el token necesita permiso `whatsapp_business_management`.
- Arreglo: `POST` al mismo endpoint. Cuidado: [V-web] una guía advierte que un re-suscribir "al por mayor" puede resetear los campos suscriptos en cuentas de coexistencia (hay que reconfirmar `smb_message_echoes`, `history`, `smb_app_state_sync`, etc.). (https://dualhook.com/docs/coexistence, resultado de búsqueda)

**6. Campo `messages`**
- Confirmar: developers.facebook.com > tu app > WhatsApp > Configuración (Configuration) > Webhooks > Administrar/Manage: `messages` en "Suscrito". Además por API con token de app: `GET /{app-id}/subscriptions`.
- Arreglo: re-suscribir el campo. Probá des-suscribir y volver a suscribir.

**7. App en Desarrollo**
- Confirmar: developers.facebook.com > tu app > barra superior: interruptor "Modo de la app: Desarrollo/Activo (Live)". [V-web] En Desarrollo, los webhooks solo llegan para números agregados en la configuración de la API.
- Arreglo: pasar a modo Activo (requiere política de privacidad y categoría de la app).

**8. Política / calidad / pago**
- Confirmar: Business Manager > Centro de seguridad / Estado de la cuenta y "Calidad de la cuenta" en el administrador de WhatsApp. Revisá Soporte > "Mensajes de soporte" y el correo del administrador.
- [NV] No encontré evidencia de que la falta de método de pago corte la recepción. Pero agregalo igual como descarte barato, porque algunas limitaciones de WABA sin pago pueden aparecer sin aviso claro.

**9. Estado de plataforma de Meta**
- Confirmar: la página de estado de Meta para desarrolladores [NV, no la verifiqué].

### 1.3 Qué NO significa el "Conectado"

[NV] El estado "Conectado" y la calificación "Alta" en el panel NO prueban que los webhooks se estén enviando. Prueban que el número está registrado. La verificación real es el flujo end-to-end (mensaje externo > webhook).

---

## 2. Arquitectura "de cero" para SOLO RECIBIR

Requisito: recibir mensajes de clientes en un CRM propio (React + Vercel + Supabase) y registrar conversaciones y compras. Nunca enviar.

### 2.0 Hechos sobre costos (con conflicto entre fuentes)

- [V-web] Desde el 1/7/2025 Meta cobra por mensaje entregado (no por conversación). Los mensajes entrantes del cliente no los paga el negocio. (Sleekflow, Flowcall, Chattigo)
- [V-web, CONFLICTIVO] Para mensajes de "servicio" (respuestas dentro de las 24 h) en Argentina: algunas fuentes dicen USD 0,026/mensaje desde 1/10/2026 (Volga AI, SleekFlow), otras los muestran gratis (Zernio, Flowcall). Además, se menciona 1.000 mensajes de servicio gratis por número y mes. La página oficial de Meta que aparecía estaba desactualizada. **No pude verificar la tarifa real.**
- Como vos NO enviás, esto casi no te afecta: recibir no se cobra. [NV] Confirmalo con tu panel de facturación.
- [V-web] Argentina pasó a facturación en ARS en abril 2026 (Chattigo). [NV]
- Fuentes: https://sleekflow.io/en-us/blog/whatsapp-business-price, https://www.twilio.com/en-us/whatsapp/pricing, https://martechcost.com/whatsapp-pricing/argentina, https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing

### 2.1 Comparativa

| Opción | Costo real (AR) | Pasos | Riesgos | "Solo recibir" | Privacidad / política |
|---|---|---|---|---|---|
| **(a) Cloud API propia con número DEDICADO** | Recibir: sin cargo por mensaje [V-web]. Sin fee de licencia (es directo con Meta). Necesitás un número que NO esté en WhatsApp/WhatsApp Business (chip nuevo o línea fija con SMS/voz). Posible verificación del negocio. | 1) App en developers.facebook.com tipo Business. 2) WABA en Business Manager. 3) Agregar y verificar número (SMS/llamada). 4) Webhook `messages`. 5) `POST /{waba}/subscribed_apps`. 6) Usuario del sistema con token permanente. 7) Responder 200 rápido, guardar el JSON crudo, procesar luego. 8) Verificar firma `X-Hub-Signature-256`. | Los clientes deben escribirle a ESE número nuevo (cambio de hábito). El número no puede usarse a la vez en el celular. Dependencia de Meta. | Sí. Podés no enviar nunca. | Cumple con los términos de Meta. Hay que tener política de privacidad pública y base legal (Ley 25.326 AR) [NV]. |
| **(b) Coexistencia (app del celular + Cloud API)** | Igual que (a) en cargos [V-web]. Mantiene tu número actual. | Embedded Signup con flujo de coexistencia desde la app del celular. Webhooks: `messages`, `smb_message_echoes` (lo que enviás desde la app), `history` (historial), `smb_app_state_sync` (contactos). [V-web] 360dialog docs. | Se puede desconectar si no abrís la app ~13-14 días [V-web]. Sin soporte de dispositivos "no soportados" (Windows, WearOS no generan echoes) [V-web]. Requisitos mínimos de uso previo de la app [NV]. Es probablemente tu situación actual y hoy es la fuente más probable del problema. | Sí, aunque el celular sigue pudiendo enviar. | Oficial. Atención a datos históricos importados (`history`), que son datos personales. |
| **(c) BSP oficial (360dialog, Twilio, Gupshup, etc.)** | 360dialog: ~USD/EUR 49 por número por mes (plan Regular), 99 Premium, más tarifas de Meta [V-web] https://docs.360dialog.com/docs/welcome-to-360dialog/prices-plans-and-payments (docs de 360dialog; precio puede estar desactualizado). Twilio y Gupshup: **no logré verificar precios**. **No encontré plan gratis para solo recibir.** | Alta con el BSP, número, webhook a tu endpoint (formato casi igual a la Cloud API). | Costo fijo mensual. El BSP agrega una capa más de fallas. | Sí. | Oficial. Contrato con un tercero que procesa datos (encargado de tratamiento). |
| **(d) Puentes tipo WhatsApp Web (WAHA, Evolution API, Baileys)** | Software gratis o con planes pagos (WAHA: núcleo gratis y planes pagos [V-web]). Más un servidor 24/7 (VPS) con almacenamiento de sesión. | Escanear QR, recibir eventos por webhook. | Violan los términos de WhatsApp; riesgo de bloqueo del número, incluso permanente [V-web, fuentes comerciales y parcialmente contradictorias]. La cifra "68% bloqueados en un año" circula pero **no tiene fuente primaria: no la uses**. Sesión inestable. | Técnicamente sí, pero el cliente con el que hablás sigue "viendo" tu cuenta normal. | Riesgo legal/contractual. Procesás datos sin canal oficial. NO recomendado para un negocio con el número principal. |
| **(e) Otras (exportar chats, reenviar, email)** | Gratis. | Exportar chat desde la app (manual), o reenviar a un número/bot. Notificaciones a email. | Manual, no en tiempo real, se pierden datos. | Sí (es manual). | Sin riesgo de cuenta. Solo sirve como respaldo/migración puntual. |

### 2.2 Recomendación

**Principal: (a) Cloud API propia con número DEDICADO.** La causa más probable de tu caída (coexistencia, usuarios borrados, overrides) desaparece en gran parte si el número es solo de la API. Sigue siendo gratis para recibir.
- Elegí el número nuevo, avisá a los clientes ("escribinos a este número para pedidos"). Mantené el número viejo con un mensaje automático desde la app del celular apuntando al nuevo (eso lo hacés vos a mano en la app, no desde el CRM).
- Diseño del receptor en Vercel/Supabase: responder 200 inmediato, guardar el payload crudo en una tabla `wa_webhook_raw` (con `received_at`), procesar de manera idempotente por `messages[].id`, y un job de "heartbeat" que alerte si pasan N horas sin eventos en horario laboral.
- Mantené un **canal de verificación continua**: un chequeo diario (cron en Vercel) que haga `GET subscribed_apps` y `GET phone-number` y alerte por email si cambian. Así detectás la caída en horas, no días.

**Plan B: (c) un BSP** (360dialog por la transparencia de precios documentada, o el que te dé mejor soporte en español en Argentina). Pagás ~49 por mes por número [V-web] pero ganás soporte y una capa que absorbe cambios de Meta. Si necesitás mantener el número actual en el celular, el BSP también soporta coexistencia [V-web 360dialog].

**No usar (d)** con el número comercial principal.

---

## 3. Checklist de diagnóstico para HOY

(Rutas [NV]: adaptar a lo que muestre el panel.)

1. **Prueba externa:** desde otro teléfono, escribir al +54 9 11 5262-7555. Anotar hora exacta. Ver si llega a la app del celular y si aparece algo en los logs de Vercel (`/api/whatsapp-webhook`).
2. **Log de actividad:** business.facebook.com > Configuración del negocio > Registro de actividad / Historial. Filtrar 13/10/2026. Abrir los dos "Deleted User". Capturar pantalla: qué activo, qué acción, quién la hizo.
3. **Usuarios y activos:** Configuración del negocio > Usuarios > Personas y Usuarios del sistema: ¿quién falta? Cuentas > Cuentas de WhatsApp > tu WABA > Personas / Aplicaciones: ¿está tu app asignada con control total?
4. **Estado del número:** Cuentas > Cuentas de WhatsApp > tu WABA > Números de teléfono: estado, calificación, plataforma, método de pago.
5. **Por API (con el token de sistema de diagnóstico):**
   - `GET /{waba-id}/subscribed_apps`: ¿figura TU app id?
   - `GET /{waba-id}?fields=webhook_configuration` y `GET /{phone-number-id}?fields=webhook_configuration`: ¿hay override?
   - `GET /{phone-number-id}?fields=status,platform_type,account_mode,quality_rating,code_verification_status`.
   - `GET /{app-id}/subscriptions` con token de app: ¿`messages` suscrito a la URL correcta?
6. **App:** developers.facebook.com > tu app > Configuración básica: modo (Desarrollo/Activo), estado de revisión de la app, alertas rojas arriba. WhatsApp > Configuración: callback URL y campos.
7. **Celular:** app WhatsApp Business > Ajustes > Cuenta > Plataforma de WhatsApp Business. ¿Muestra el número conectado? ¿Cuándo la abriste por última vez? (regla 13-14 días).
8. **Cuenta/política:** Business Manager > Centro de seguridad / Estado de la cuenta; Soporte > mensajes. Mirar el correo del admin por avisos del 13/10.
9. **Descartes:** estado de la plataforma de Meta; agregar método de pago.
10. **Si algo cambió (override, desconexión):** corregir y repetir la prueba 1.

### 3.1 Evidencia para el caso de soporte de Meta

Juntar:
- WABA ID, Phone Number ID, App ID, Business ID.
- Capturas del log de actividad (los dos "Deleted User", 13/10 17:43 hora AR = 20:43 UTC).
- Salida de los GET del punto 5 (sin tokens).
- Hora del último webhook recibido (log de Vercel) y hora/resultado de la prueba del punto 1.
- Captura de que el "Probar" del panel sí llega.
- Aclarar que el endpoint responde 200 y valida firma.

Texto sugerido (corto):

> Asunto: La WABA dejó de entregar webhooks de mensajes entrantes desde el 13/10/2026 17:43 (hora Argentina)
>
> Hola, tenemos la app [APP ID] con la WABA [WABA ID] y el número [PHONE NUMBER ID] (+54 9 11 5262-7555), que figura "Conectado" con calificación Alta. Hasta el 13/10/2026 17:43 (GMT-3) recibíamos por webhook (campo "messages") todos los mensajes entrantes en https://poli-crm.vercel.app/api/whatsapp-webhook. Desde entonces no llega ningún evento, aunque se envían mensajes de prueba desde otro teléfono. El botón "Probar" del panel sí llega a nuestro endpoint, que responde 200 y valida la firma. Recreamos el subscribed_apps de la WABA sin efecto. El log de actividad muestra dos eventos "Deleted User" el 13/10. El número puede estar usado también en la app WhatsApp Business (coexistencia). Pedimos revisar: (1) estado de entrega de webhooks de la WABA/número, (2) si la coexistencia fue desconectada, (3) overrides de callback, (4) restricciones de cuenta. Adjuntamos capturas e IDs. Gracias.

---

## 4. Repositorios y videos (solo los que salieron en las búsquedas)

Repositorios (datos de la API de GitHub al 2026-10-15, vistos en resultados de búsqueda):

| Repo | Estrellas | Actividad | Licencia |
|---|---|---|---|
| https://github.com/devlikeapro/waha (WAHA, motores WEBJS/NOWEB/GOWS/WPP) | ~7.600 | actualizado 2026-10-15 | **No verificada** (no pude leer LICENSE: acceso denegado) |
| https://github.com/WhiskeySockets/Baileys | ~11.300 | actualizado 2026-10-15 | **No verificada** en GitHub. Un blog dice MIT [V-web] |
| https://github.com/EvolutionAPI/evolution-api | no figuró directo en la búsqueda; un blog dice ~9.400 estrellas y Apache 2.0 con condiciones extra [V-web] https://pasqualepillitteri.it/en/news/12969/integrate-whatsapp-evolution-api-vs-cloud-api | **No verificado** el repo directo | **No verificada** |
| https://github.com/agamenonmacondo/whatsapp-bridge ("WhatsApp Cloud API Bridge: webhook receiver, LLM routing, Supabase history", Python) | 0 | jun 2026, personal | **No verificada**. Solo referencia, no es confiable por falta de uso. |
| https://github.com/chatwoot/chatwoot/issues/14738 (issue sobre `+` en la ruta del callback) | n/a | issue | n/a |

Videos de YouTube (títulos y URLs tal como salieron en la búsqueda; no vi su contenido):
- WhatsApp Cloud API Webhook Setup from Meta App: https://www.youtube.com/watch?v=N5LLmBtcfCs
- Getting Started with WhatsApp Cloud APIs in 2026: https://www.youtube.com/watch?v=8hKEbOHWyQk
- WhatsApp Business API Setup 2026 (Step-by-Step) + Permanent Access Token + n8n Integration: https://www.youtube.com/watch?v=2C99NvvOg_k
- How to set up the Webhook for receiving the user Messages in the WhatsApp Cloud API: https://www.youtube.com/watch?v=5K5gIznvJkc
- Webhooks: Cómo Recibir Mensajes con la API WhatsApp (en español): https://www.youtube.com/watch?v=rV2ZUkxVhNk

Documentación y foros citados:
- Meta, webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/
- Meta, overrides: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/
- Meta, onboarding de usuarios de la app (coexistencia): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/ (el extracto no incluía los detalles)
- 360dialog, coexistencia: https://docs.360dialog.com/docs/resources/phone-numbers/coexistence y https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence/coexistence-webhooks
- Foro Meta: https://developers.facebook.com/community/threads/2114367935801453/ (webhook POST no disparado con número CONNECTED)
- Medium, "Shadow Delivery": https://medium.com/@siri.prasad/the-shadow-delivery-mystery-why-your-whatsapp-cloud-api-webhooks-silently-fail-and-how-to-fix-2c7383fec59f

---

## 5. Lo que NO pude verificar

1. Contenido completo de TODA la documentación de Meta (WebFetch bloqueado por DNS). Solo vi extractos de la búsqueda.
2. Las rutas exactas de menú del Business Manager y del panel de desarrolladores. Son de memoria o inferidas.
3. Si Meta desactiva automáticamente webhooks de WhatsApp por fallas del endpoint (no hay fuente que lo confirme).
4. El plazo exacto de inactividad de la coexistencia (13 vs ~14 días; solo fuentes de BSP) y si Meta envía un webhook de desconexión.
5. Los nombres exactos de campos de la API de diagnóstico (`webhook_configuration`, `platform_type`, etc.) y los cuerpos para borrar overrides.
6. Si la etiqueta "App de WhatsApp Business" de tu WABA indica coexistencia o una WABA creada por la app del celular.
7. La tarifa real para mensajes de servicio en Argentina (hay fuentes que dicen gratis y otras USD 0,026) y si recibir realmente no cuesta nada en tu facturación.
8. Precios actuales de Twilio y Gupshup, y si existe un plan gratis para solo recibir (no lo encontré).
9. Las licencias reales de WAHA, Baileys y Evolution API en sus repos (acceso a LICENSE denegado en esta sesión).
10. El contenido de los videos de YouTube listados y su vigencia.
11. El riesgo real de bloqueo de WAHA/Evolution/Baileys (solo fuentes comerciales; la cifra del 68% es sin fuente primaria).
12. Requisitos de elegibilidad exactos para coexistencia y límites del historial (`history`).
13. Qué generó los dos "Deleted User" del 13/10 y si esto es la causa. Es una hipótesis, no un hecho.
14. Si la falta de método de pago afecta la recepción de webhooks.
15. Cumplimiento legal argentino (Ley 25.326) para la política de privacidad: no fue investigado.
