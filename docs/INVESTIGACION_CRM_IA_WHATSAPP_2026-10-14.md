# Investigación: CRMs con IA + WhatsApp/redes — repos, alternativas de conexión, videos y recomendación

Fecha: 2026-10-14 · Para: Poliplast (CRM propio React + Vite + Supabase + Vercel serverless) · Restricción: costo extra cero (Felipe)

## Leyenda de verificación

- **[V]** Verificado en esta sesión leyendo la página de GitHub (stars, licencia) o el feed Atom de GitHub (fecha de actividad).
- **[V-web]** Surgió de una búsqueda web, de una fuente secundaria (blogs de proveedores, foros). No verificado contra la fuente oficial.
- **[NV]** No verificado. Viene de conocimiento previo o se infiere. Confirmar antes de decidir.

Limitaciones de esta investigación:
- La API de GitHub y los sitios `developers.facebook.com` y `waha.devlike.pro` no fueron accesibles desde este entorno. Por eso no pude leer la documentación oficial de Meta ni la de WAHA.
- Las stars son aproximadas y se leyeron de la página del repo el 2026-10-14.
- La "última actividad" sale de los feeds Atom de commits o releases. Para algunos repos solo obtuve la fecha del último release, no la del último commit.
- De los videos de YouTube tengo título y URL (devueltos por la búsqueda), pero **no pude confirmar el nombre del canal** en ningún caso, ni el contenido real. Los títulos son reales. Mirá el canal antes de invertir tiempo.

---

## 0. Diagnóstico rápido de lo que ya tienen (Cloud API que "dejó de recibir mensajes")

Antes de cambiar de tecnología conviene descartar fallas de configuración. Estas son las causas más citadas en foros de Meta, n8n y Frappe **[V-web, no oficial]**:

1. La app no está suscripta a la WABA (WhatsApp Business Account). El GET de verificación del webhook pasa, pero nunca llegan POST de mensajes entrantes. Hay que re-suscribir la app a la WABA y confirmar que el campo `messages` esté activo.
2. La app de Meta está en modo Development, y solo entrega mensajes de usuarios autorizados como testers. Para mensajes de clientes reales tiene que estar en modo Live.
3. El número está en estado `PENDING` y no `CONNECTED`. Un número pendiente recibe mensajes pero no emite webhooks.
4. El endpoint de Vercel tarda o devuelve algo distinto de 200 rápido. Esto está por verificar en sus logs: usar `get_runtime_logs` y buscar POSTs a la ruta del webhook.
5. Una vez que un número se registra en la Cloud API, **deja de funcionar en la app WhatsApp Business del celular**, salvo que se use coexistencia (ver sección B.4). Si hoy la gente chatea desde el celular con ese número, es probable que ese sea el problema de fondo.

Conclusión: el requisito "solo ver chats, no responder" se resuelve mejor con coexistencia o con WhatsApp Web (WAHA/Evolution). Ver sección B.

---

## A. Repositorios open source relevantes

Se priorizaron los que sirven para los 3 objetivos: (1) registrar chats de WhatsApp, (2) IA que resuma, sugiera próximo paso y detecte compras, (3) prospección.

### A.1 Capa de conexión WhatsApp (lo más urgente)

| # | Repo | Stars | Licencia | Última actividad | Qué hace | Cómo nos sirve |
|---|------|-------|----------|------------------|----------|----------------|
| 1 | **WAHA** — https://github.com/devlikeapro/waha | ~7.6k [V] | Apache-2.0 [V] | Release 2026.9.2 del 2026-10-02 [V] | API HTTP REST self-hosted para WhatsApp. Motores WEBJS (Puppeteer), NOWEB (websocket), GOWS (Go) y WPP [V]. Manda webhooks por cada mensaje. | **Candidato #1 para "solo leer".** Un docker, escanean el QR con el WhatsApp del negocio, y WAHA hace POST de cada mensaje (entrante y saliente) a un endpoint nuestro (función serverless de Vercel → tabla de Supabase). Hay nodo oficial para n8n [V-web]. Una nota de releases dice que las funciones Plus pasaron al Core desde 2026.6.1 [V-web, no confirmado]. Antes se decía que Plus se necesitaba para varias sesiones; verificar en su sitio. |
| 2 | **Evolution API** — https://github.com/EvolutionAPI/evolution-api (el repo se mudó a la org `evolution-foundation`) | ~9.8k [V] | Apache-2.0 con condiciones extra (mantener logo y copyright en el frontend, aviso de uso) [V] | Último commit 2026-05-06 y último release 2.4.0-rc2 del 2026-05-17 [V]. El último estable es v2.3.7 de 2025-12-05 [V]. **Más de 5 meses sin actividad aparente.** | API REST para WhatsApp con dos modos: Baileys (WhatsApp Web) y Cloud API oficial. Integraciones nativas con Chatwoot, Typebot, Dify, OpenAI, n8n, Flowise, RabbitMQ/Kafka/SQS [V]. | Alternativa a WAHA con más integraciones listas. Por la inactividad reciente es más riesgosa que WAHA. Ojo: el mismo servidor puede hablar con Cloud API oficial, lo que sirve si más adelante migran. |
| 3 | **Baileys** — https://github.com/WhiskeySockets/Baileys | ~11.3k [V] | MIT [V] | Release v7.0.0-rc14 del 2026-07-29 [V] | Librería TypeScript de WhatsApp Web por websocket. Aclara que no está afiliada a WhatsApp y no avala usos que violen sus términos [V]. | Es el motor dentro de Evolution API y NOWEB. Usarla directo implica programar más. Solo si queremos control total. La 7.x trae cambios que rompen compatibilidad [V]. |
| 4 | **whatsapp-web.js** — https://github.com/pedroslopez/whatsapp-web.js | ~22.7k [V] | Apache-2.0 [V] | Release v1.34.7 del 2026-04-24 [V] | Cliente Node.js que maneja WhatsApp Web con navegador (Puppeteer). Su README dice que "no se garantiza que no te bloqueen" y que WhatsApp no permite bots ni clientes no oficiales [V]. | Es lo más popular, pero consume más (Chromium). WAHA con WEBJS ya lo envuelve. No lo usaría directo. |
| 5 | **whatsmeow** — https://github.com/tulir/whatsmeow | ~7.6k [V] | MPL-2.0 [V] | Commit del 2026-10-14 [V] | Librería Go para la API multi-device de WhatsApp Web. Base de GOWS y de puentes Matrix. | Muy activa. Solo si alguien del equipo sabe Go. La usaríamos de forma indirecta vía WAHA/GOWS. |
| 6 | **WPPConnect Server** — https://github.com/wppconnect-team/wppconnect-server | ~1.1k [V] | Apache-2.0 [V] | [NV] no revisé la actividad | API lista para instalar sobre WPPConnect (WhatsApp Web). | Alternativa menor a WAHA. Sin ventaja clara. |

### A.2 CRM / bandeja de entrada

| # | Repo | Stars | Licencia | Última actividad | Qué hace | Cómo nos sirve |
|---|------|-------|----------|------------------|----------|----------------|
| 7 | **Chatwoot** — https://github.com/chatwoot/chatwoot | ~37.8k [V] | MIT (según el README) [V]. Hay código Enterprise aparte con licencia propia [NV]. | Commit del 2026-10-14 [V] | Bandeja omnicanal (WhatsApp, Instagram, Facebook, email, web chat, etc.), estilo Intercom/Zendesk [V]. Tiene "Captain" (asistente, copiloto, memorias de contacto). En self-hosted, **Captain requiere Edición Enterprise de pago + API key de OpenAI** [V-web]. | La mejor opción para **un solo lugar donde ver WhatsApp + Instagram + Facebook**. Se conecta con Evolution API (integración nativa [V]) o con WAHA vía webhooks. No es un CRM de ventas profundo (sin pipeline). Podemos usarlo solo como "bandeja de lectura" y que nuestro CRM lea sus webhooks. Sin pagar, **no tenemos Captain**; el resumen con IA lo haríamos nosotros con una función propia. |
| 8 | **Twenty CRM** — https://github.com/twentyhq/twenty | ~58.3k [V] | La página enlaza LICENSE pero no la nombra [V]. Entiendo que es AGPL-3.0 con parte comercial [NV]. | Commit del 2026-10-14 [V] | "La alternativa abierta a Salesforce, diseñada para IA": objetos personalizables, API GraphQL/REST, agentes y chat de IA [V]. No tiene WhatsApp nativo [V]. | Referencia de diseño moderna (stack TypeScript/React, parecido al nuestro). Se instala con Docker. No lo adoptaría para reemplazar el CRM propio; sirve para robar ideas de modelo de datos y de agentes. WhatsApp lo agregarías vía webhooks/n8n. |
| 9 | **Frappe CRM** — https://github.com/frappe/crm | ~3.8k [V] | AGPL-3.0 [V] | Release v1.87.0 del 2026-10-09 [V] | CRM de ventas simple, usuarios ilimitados. Envía/recibe WhatsApp a través de la app aparte `shridarpatil/frappe_whatsapp` [V]. | CRM más "completo para ventas" con WhatsApp ya pensado. Es otro stack (Python/Frappe + Vue), por lo que sería una migración, no un complemento. |
| 10 | **Krayin CRM** — https://github.com/krayin/laravel-crm | ~24.0k [V] | MIT [V] | Release v2.2.6 del 2026-09-10 [V] | CRM de leads y ventas en Laravel. | Opción si quisieran un CRM de pipeline listo. Stack PHP. WhatsApp requeriría integración propia [NV]. |
| 11 | **EspoCRM** — https://github.com/espocrm/espocrm | ~3.5k [V] | AGPL-3.0 [V] | Commit del 2026-10-14 [V] | CRM clásico (leads, contactos, oportunidades, casos). | Referencia de CRM maduro. Sin ventaja decisiva para nosotros. |
| 12 | **Odoo** — https://github.com/odoo/odoo | ~55.0k [V] | La página no nombra la licencia [V]. Community es LGPL-3 [NV]. | [NV] | Suite ERP/CRM completa. | Demasiado grande para lo que se necesita ahora. Mencionado solo como opción a largo plazo si se quisiera unificar ventas, stock y facturación. |
| 13 | **SuiteCRM (Core)** — https://github.com/SuiteCRM/SuiteCRM-Core | ~286 [V] (la página parece ser un mirror del núcleo) | AGPL-3.0 [V] | Release 8.10.2 del 2026-07-31 [V] | CRM empresarial (Angular + Symfony). | Sin ventaja para este caso. |

### A.3 Automatización e IA (el "pegamento" para resumir y detectar compras)

| # | Repo | Stars | Licencia | Última actividad | Qué hace | Cómo nos sirve |
|---|------|-------|----------|------------------|----------|----------------|
| 14 | **n8n** — https://github.com/n8n-io/n8n | ~207k [V] | **Sustainable Use License (fair-code), no es open source puro** [V]. Uso interno de la empresa permitido. Hay restricciones para revender como servicio [V-web]. | Releases del 2026-10-14 [V] | Plataforma visual de workflows con nodos de IA, 400+ integraciones [V]. | Orquestador ideal: recibe el webhook de WAHA, guarda en Supabase, llama a un LLM para resumir y detectar compra, y escribe el resultado. Self-hosted gratis (sin costo de licencia; el costo del LLM sigue). Alternativa sin n8n: todo en funciones de Vercel. |
| 15 | **Typebot** — https://github.com/baptisteArno/typebot.io | ~10.5k [V] | **Inconsistente: insignia AGPLv3, pero el README dice Functional Source License** [V] | Release v3.19.0 del 2026-09-14 [V] | Constructor visual de chatbots, integrado con Evolution API. | Útil si algún día quieren un bot que responda. **Hoy no lo necesitamos** (solo lectura). |
| 16 | **Dify** — https://github.com/langgenius/dify | ~158.5k [V] | Dify Open Source License, basada en Apache 2.0 con condiciones extra [V] | Release v1.17.1 del 2026-09-10 [V] | Plataforma de apps LLM (workflows, RAG, agentes). | Alternativa a n8n para la parte de IA, con interfaz para ajustar prompts. Pesada de instalar. Para nuestra escala, un prompt en una función alcanza. |
| 17 | **Rasa** — https://github.com/RasaHQ/rasa | ~21.4k [V] | Apache-2.0 [V] | **En modo mantenimiento**; último release 3.6.21 de enero 2025 [V] | Framework de chatbots. | **Descartado.** Está en mantenimiento y no resuelve nuestro problema (resumen/clasificación con LLM). |

Nota: no encontré repos que hagan exactamente "CRM + WhatsApp + IA" listos para usar con buena reputación. Lo que hay son piezas (WAHA/Evolution + n8n + un CRM). No inventé ninguno.

---

## B. Cómo conectar WhatsApp sin depender del flujo de Meta que falló

### B.1 Cloud API directo (lo que usan hoy)

- **Qué es:** API oficial. Meta cobra por mensaje desde el 2025-07-01. Según Meta (actualizado 2026-03-30), los mensajes que no son plantilla son gratis dentro de una ventana de atención al cliente abierta, y las plantillas de utilidad dentro de la ventana también [V-web].
- **Costos Argentina:** las fuentes **no coinciden**. Desde marketing USD 0,0450 a 0,0618, utilidad USD 0,0075 a 0,0260 [V-web]. Hay que mirar la tarifa oficial de Meta.
- **Para "solo leer":** recibir mensajes entrantes dentro de la ventana es **gratis** [V-web]. El costo aparece solo si mandan plantillas.
- **Riesgos:**
  - Cumple los términos, sin riesgo de ban por usar la vía oficial.
  - Desde 2026-01-15, los términos prohíben a proveedores cuyo producto principal es un chatbot de IA general distribuirlo por la API. **Un bot de atención o un resumen interno no está afectado** [V-web].
  - El número queda "en la API" y deja de funcionar normalmente en la app del celular, salvo coexistencia.
  - La verificación de empresa y la configuración son fricción. Ver diagnóstico en la sección 0.

### B.2 BSPs (proveedores oficiales)

- Ejemplos: 360dialog, Twilio, Jelou, Robbu, Chakra [V-web que existen y ofrecen coexistencia]. 360dialog publica la documentación de los webhooks de coexistencia: https://docs.360dialog.com/docs/waba-basics/phone-numbers/coexistence/coexistence-webhooks [V-web].
- **Costo:** Meta + tarifa de plataforma del BSP, que no relevé. **Rompe el "costo extra cero"** salvo que algún BSP tenga plan gratuito [NV].
- **Ventaja:** soporte, onboarding más simple. **Desventaja:** misma lógica que la Cloud API, más dependencia de un tercero.

### B.3 WAHA / Evolution API (WhatsApp Web, no oficial)

- **Cómo funciona:** emula un cliente de WhatsApp Web o multi-dispositivo. Se escanea un QR con el celular. Ven todo lo que ve el celular, enviado y recibido. Es **gratis** (hosting aparte).
- **Costo:** 0 de licencia. Necesita un servidor (VPS, o una PC siempre prendida). Evolution API y WAHA pueden correr en un VPS barato; si ya tienen alguno, el costo extra es cero [NV].
- **Riesgos, con honestidad:**
  - **Viola los términos de servicio de WhatsApp.** Los propios READMEs de Baileys y whatsapp-web.js lo reconocen [V].
  - Hay riesgo de baneo del número. Las fuentes coinciden en que el riesgo es mayor al **enviar** de forma masiva o proactiva, y menor en uso reactivo [V-web]. **Ninguna fuente confirma que un número solo-lectura esté a salvo.** Un vendedor (ChatDaddy) dice que Meta bloquea más activamente estas librerías, pero es una fuente interesada [V-web].
  - Puede desconectarse y pedir QR de nuevo. Los cambios de WhatsApp pueden romper el motor hasta que se actualice.
- **Mitigación razonable:** usar un número del negocio dedicado, no el principal de ventas. **Nunca enviar desde la API.** Evitar mensajes masivos. Hacer backup de la base. Tener plan B.
- Si el número tiene historial valioso y un baneo sería grave, esta opción es la más riesgosa.

### B.4 Coexistencia (app WhatsApp Business + Cloud API a la vez)

- **Qué es:** permite usar el mismo número en la app WhatsApp Business del celular y en la Cloud API al mismo tiempo [V-web]. Es la opción oficial más cercana a "seguir chateando desde el celular y que el CRM vea todo".
- **Webhooks relevantes** [V-web, vía 360dialog/Jelou/Robbu]:
  - `history`: historial pasado (hasta 180 días según un proveedor).
  - `smb_app_state_sync`: contactos.
  - `smb_message_echoes`: mensajes que el negocio envía desde la app, después de la conexión.
- **Argentina:** una fuente (Chakra) lo lista con soporte completo; no hay fuente oficial de Meta [V-web].
- **Requisitos citados** [V-web]: abrir la app Business al menos cada 14 días, Meta Business Portfolio verificado, y que el número esté hoy en la app Business (no en la app común). Los grupos no se sincronizan.
- **Duda importante [NV]:** no pude confirmar si el onboarding de coexistencia exige pasar por un proveedor de tecnología (Tech Provider/BSP) o si se puede hacer directo con Embedded Signup propio. Es la pregunta clave a resolver, porque determina el costo.
- **Riesgos:** cumple con los términos. Costo: igual que Cloud API (lo entrante es gratis). Es lo que recomendaría como destino final, **si el onboarding resulta posible sin pagar**.

### Resumen comparativo

| Opción | Costo extra | Riesgo de ban | Cumple ToS | "Solo ver" | Esfuerzo |
|--------|-------------|---------------|------------|-----------|----------|
| Cloud API directo | 0 si solo recibe | Ninguno | Sí | Sí, pero el celular deja de usar el número | Medio (ya lo tienen, está roto) |
| BSP (360dialog, Twilio…) | Suscripción [NV] | Ninguno | Sí | Sí | Bajo |
| WAHA / Evolution | 0 (+ servidor) | **Real** | **No** | Sí, nativo | Bajo |
| Coexistencia | 0 a incierto | Ninguno | Sí | Sí, y el celular sigue funcionando | Medio, con incógnitas |

---

## C. Canales y videos / tutoriales

Verificación: **los títulos y URLs salen de resultados de búsqueda reales en YouTube. No pude verificar el nombre del canal, la fecha exacta, ni que el contenido sea correcto o esté actualizado.** Las guías de Evolution API y WAHA cambian rápido: confirmar que el video corresponda a la versión actual (v2.x).

### WAHA + n8n
- "WAHA (WhatsApp) + N8N" — https://www.youtube.com/watch?v=eC80Gm3WVX8
- "n8n + WhatsApp Grátis com o WaHa e Docker: O Jeito Mais Fácil!" (portugués) — https://www.youtube.com/watch?v=1ziVHpIj2eU
- "Crie seu AGENTE WHATSAPP com N8N + WAHA grátis!" (portugués) — https://www.youtube.com/watch?v=ge7mPegGdXI
- "Automação de WhatsApp com N8N e API WAHA" (portugués) — https://www.youtube.com/watch?v=Fx5IyGgHmoo
- "Tutorial n8n + WAHA: Best Practice Chatbot WhatsApp Anti Crash" (idioma probablemente indonesio) — https://www.youtube.com/watch?v=rKBAUJWz-Fg
- Texto: "How to build a self-hosted WhatsApp bot with n8n and WAHA" (freeCodeCamp) — https://www.freecodecamp.org/news/how-to-build-a-self-hosted-whatsapp-bot-with-n8n-and-waha. Cubre Docker Compose, QR, webhook a n8n y endurecimiento (HTTPS, API key) [V-web]. **Es el recurso que más recomiendo leer primero.**

### Evolution API + Chatwoot (en español)
- "Cómo instalar Evolution API y conectar Chatwoot con WhatsApp (paso a paso real en VPS)" — https://www.youtube.com/watch?v=4tPNR2ZSbyM
- "Instalar EvolutionApi y conectar con WhatsApp" — https://www.youtube.com/watch?v=l5Np2dN0NJU
- "Cómo Instalar Evolution API y Conecta WhatsApp con n8n" — https://www.youtube.com/watch?v=4qG8TA_yMxI
- "Cómo integrar Evolution API v2 con Chatwoot + [Recuperar historial de mensajes]" — https://www.youtube.com/watch?v=SHulNC_6KRc (el único que menciona historial; el título ya dice v2)
- "💚 ¿Cómo integrar Evolution API + Chatwoot (WhatsApp Multiagente) 2024" — https://www.youtube.com/watch?v=s4oINLbyTlY (2024, posiblemente desactualizado)

### n8n + WhatsApp + IA + Supabase
- "Build an Advanced WhatsApp AI Agent using n8n, Supabase, Evolution API, Google Sheets, Chat Summary" — https://www.youtube.com/watch?v=MmLwib15MWM (el más cercano a nuestro caso, por incluir resumen de chat y Supabase)
- "AI Chatbot That Remembers You! (n8n + Supabase + WhatsApp)" — https://www.youtube.com/watch?v=TqRaCpQJbEA

### Twenty CRM
- "How to Install Twenty CRM on Ubuntu 24.04 (Step-by-Step Self-Hosted Setup Guide)" — https://www.youtube.com/watch?v=Lc8dwAnuJFY
- "Install Twenty CRM in 2 Minutes with Coolify" — https://www.youtube.com/watch?v=Ou7PVP0MkGc

### Chatwoot
- No encontré videos de Chatwoot con YouTube en las búsquedas hechas; solo documentación escrita (guía oficial para habilitar Captain en self-hosted: https://www.chatwoot.com/hc/user-guide/articles/1755284287-how-to-enable-captain-on-self_hosted-installations [V-web]). Falta buscar de nuevo con otros términos.

**Canales:** no pude verificar ningún nombre de canal. No voy a inventar nombres. Para encontrarlos, abran los links y anoten el canal.

---

## D. Qué hacen los CRMs comerciales con IA (y qué robar)

Todo viene de búsquedas web. No pude leer la documentación oficial de cada proveedor. **[V-web]** salvo indicación.

| CRM | Qué hace con IA | Idea para robar |
|-----|-----------------|-----------------|
| **HubSpot Breeze** | Copilot, agentes (contenido, redes, prospección, atención al cliente), Breeze Intelligence para enriquecer datos con perfiles de empresas y compradores, con créditos aparte. El agente de prospección investiga cuentas y redacta mensajes con datos del CRM. Un tercero indica ~USD 1 por lead recomendado (**no confirmado**). | Un "agente de prospección" que investigue una empresa y proponga el mensaje, con el humano aprobando. Enriquecer contactos nuevos automáticamente. |
| **Pipedrive** | Resumen de emails (Premium+): da Resumen, Sentimiento, **"Readiness to buy" de 1 a 10** y Action items (docs oficiales). Asistente de ventas en beta (docs oficiales). | **El formato de salida del resumen** es exactamente lo que necesitamos: resumen + sentimiento + puntaje de intención de compra + acciones. Copiarlo como JSON del prompt. |
| **Kommo** | Resumen de conversaciones, respuestas sugeridas, reescritura de texto, análisis de sentimiento en la bandeja, agente de IA para WhatsApp, Copilot dentro del CRM. Desde USD 15/usuario/mes según su web (marketing). | Es el que más se parece a lo que buscamos (CRM centrado en WhatsApp). Copiar: sentimiento visible en la lista de chats y resumen al abrir el contacto. |
| **Zoho Zia** | Sentimiento de emails, probabilidad de cierre de un deal, alertas cuando un cliente nombra a un competidor, y agentes. Algunas funciones solo en planes altos (fuentes secundarias, sin confirmar). | Alerta automática cuando el cliente nombra a un competidor o baja el engagement. Probabilidad de cierre simple basada en etapa y actividad. |
| **Attio** | "Ask Attio" (consultas en lenguaje natural sobre los datos), inteligencia de llamadas, workflows con IA (fuente: comparativa de un tercero). Sin enriquecimiento propio, se complementa con Clay. | Una caja de "preguntale a tu CRM" ("¿qué clientes preguntaron por Penosil y no compraron?") sobre nuestras tablas de Supabase. |
| **Clay** | Enriquecimiento "en cascada" (consulta varias fuentes de datos hasta completar), y "Claygent", un agente que lee páginas web y devuelve datos estructurados por fila. Integración bidireccional con Attio desde marzo 2026. | Para prospección: una lista de empresas (carroceras, fabricantes de PRFV) + un agente que lea su web y extraiga qué fabrican y datos de contacto, fila por fila. Eso se puede hacer con un LLM + búsqueda sin pagar Clay. |

Ideas transversales de mayor valor para Poliplast:
1. Un resumen estructurado fijo por conversación (resumen, sentimiento, intención de compra 0-10, productos mencionados, próximo paso, fecha sugerida de seguimiento).
2. "Cola de próximos pasos": una lista diaria de contactos que necesitan acción, ordenada por intención y antigüedad del último mensaje.
3. Detección de compra: cuando el LLM detecta pedido, cantidad o precio acordado, crear un borrador de oportunidad que una persona confirma. No cerrar ventas automáticamente.

---

## E. Recomendación priorizada (costo extra cero)

Supuesto: Felipe ya paga el hosting actual (Vercel + Supabase) y tiene alguna PC o VPS que pueda quedar prendida. El único costo recurrente nuevo sería el uso de un LLM. Hay que revisar el presupuesto de ese gasto, porque un resumen por conversación cuesta centavos pero no es cero [NV: no calculé el costo].

### Paso 0 (media hora, sin instalar nada): diagnosticar la Cloud API
1. En Meta Business, revisar: app en modo Live, suscripción de la app a la WABA, campo `messages` activo, estado del número `CONNECTED`.
2. En Vercel, ver los logs de la función del webhook y enviar un mensaje real de otro teléfono.
3. Preguntarse: ¿el número también se usa en el celular con la app Business? Si sí, hay conflicto y hace falta coexistencia (paso 3).
Si esto lo arregla, ahorrás todo lo demás para la fase de IA.

### Paso 1 (1 a 2 días): probar WAHA en un número de prueba
1. Levantar WAHA con Docker en una PC o VPS (imagen `devlikeapro/waha`). Motor NOWEB o GOWS para consumir menos memoria que WEBJS. Aclaración: la imagen Plus necesita login aparte [V]; probar primero con la gratuita.
2. Usar un **número secundario** (chip prepago o línea de prueba), nunca el número principal de ventas.
3. Configurar el webhook de WAHA hacia una función nueva de Vercel (`/api/waha-webhook`) que guarde cada mensaje en Supabase (tabla `whatsapp_messages`: contacto, dirección, texto, fecha, tipo de medio, id externo para evitar duplicados).
4. Validar un día entero de mensajes reales. Revisar que no pida el QR otra vez y que lleguen enviados y recibidos.
5. Seguir el tutorial escrito de freeCodeCamp (sección C).
Resultado: el requisito (1) funciona, con el riesgo de ban descrito en B.3 asumido solo en un número de prueba.

### Paso 2 (2 a 3 días): IA de resumen, próximo paso y detección de compra
1. Una función serverless (o un workflow en n8n si prefieren visual) que, por conversación con actividad nueva, llame a un LLM y guarde en Supabase un JSON con: `resumen`, `sentimiento`, `intencion_compra` (0 a 10), `productos_mencionados`, `proximo_paso`, `fecha_seguimiento`, `posible_compra` (bool).
2. Tomar el formato de Pipedrive (sección D) como base.
3. Mostrarlo en el CRM actual, en la ficha del contacto. La "posible compra" genera un borrador de oportunidad que confirma una persona.
4. Con pocos mensajes por día, el costo del LLM es bajo, pero **medirlo la primera semana**.

### Paso 3 (paralelo, sin costo): investigar coexistencia como destino oficial
1. Confirmar con Meta/Embedded Signup si se puede activar coexistencia sin BSP de pago (pregunta abierta en B.4).
2. Si es posible, migrar el flujo: los webhooks `history`, `smb_app_state_sync` y `smb_message_echoes` reemplazan a WAHA, sin riesgo de ban y con el celular funcionando.
3. Si requiere BSP de pago, decidir con Felipe si el riesgo de WAHA justifica seguir sin pagar.

### Paso 4 (opcional, solo si necesitan Instagram/Facebook): Chatwoot
Instalar Chatwoot con Docker, conectar Instagram y Facebook (y WhatsApp vía Evolution o WAHA), y que nuestro CRM lea sus webhooks. Sin Captain (pago), el resumen sigue siendo el nuestro del paso 2. Solo vale la pena si las redes sociales son canal real de ventas.

### Paso 5 (después): prospección
- Usar el patrón de Clay: lista de empresas objetivo (carroceras, talleres de PRFV, fabricantes de piletas y náutica) + un LLM con búsqueda web que complete qué hacen y propone un primer mensaje, con aprobación humana. LinkedIn: **no automatizar** el envío (viola sus términos y arriesga la cuenta; **no investigué sus términos acá** [NV]).
- Hay un skill local `anthropic-skills:agente-sourcing-poliplast` en este entorno que podría ser útil para esto; no lo evalué.

### Qué NO hacer
- No instalar Rasa (mantenimiento). No migrar a Odoo/SuiteCRM/EspoCRM ahora: es un proyecto grande que no resuelve el problema de WhatsApp.
- No enviar mensajes desde WAHA/Evolution con el número real de ventas.
- No depender de Chatwoot Captain: requiere plan de pago.

### Preguntas abiertas para verificar
1. ¿Se puede activar coexistencia directo, sin BSP? (clave)
2. ¿Qué cubre exactamente el WAHA gratuito hoy (desde 2026.6.1)? La nota de que Plus pasó a Core no está confirmada.
3. Tarifas reales de Meta para Argentina (las fuentes difieren por más de 2x).
4. Si Evolution API sigue mantenido (sin commits desde mayo 2026 en el feed consultado).
5. Costo mensual real del LLM con el volumen de chats de Poliplast.

---

## Fuentes principales consultadas
- Páginas de GitHub (repos de la sección A) y sus feeds Atom, 2026-10-14.
- Meta, términos para chatbots de IA: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform
- Coexistencia: https://docs.360dialog.com/docs/waba-basics/phone-numbers/coexistence/coexistence-webhooks, https://chakrahq.com/product/whatsapp/tools/whatsapp-coexistence-support
- Precios Cloud API: https://developers.facebook.com/docs/whatsapp/pricing (no pude abrirlo; solo vi resúmenes en buscadores)
- Pipedrive: https://support.pipedrive.com/en/article/pipedrive-ai
- Kommo: https://en.kommo.com/whatsapp-ai
- HubSpot: https://hubspot.com/products/ai
- Videos y guías: ver sección C.
