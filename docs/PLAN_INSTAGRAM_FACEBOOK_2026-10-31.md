# Instagram y Facebook en el CRM — preparación (31/10/2026)

Preparado mientras Felipe no estaba en la compu. No se tocó nada en Meta ni en el código: es la lista de lo que hay que decidir/verificar y el plan por etapas. Lo marcado **(verificar)** sale de lo investigado el 28/10 sin poder abrir developers.facebook.com: confirmarlo en la documentación de Meta antes de depender de eso.

## 1. Lo que Felipe tiene que juntar (10 minutos)
Completar esta tabla, una fila por marca. Sin esto no se puede conectar nada.

| Marca | Página de Facebook (nombre y link) | Cuenta de Instagram (@usuario) | ¿Instagram es cuenta profesional (empresa/creador)? | ¿Instagram está vinculado a la página? | Quién es administrador | Quién responde hoy los mensajes |
|---|---|---|---|---|---|---|
| Grupo Poliplast (@grupopoliplast) | | | | | | |
| Resinplast (@resinplast) | | | | | | |
| Imperpur (@imperpur) | | | | | | |
| RAPYP (@rapyp) | | | | | | |
| Penosil | | | | | | |

Cómo ver cada dato:
- **Profesional**: en Instagram → Configuración → «Tipo de cuenta». Si es personal, se cambia a profesional (gratis).
- **Vinculado**: Instagram → Configuración → Centro de cuentas, o en la página de Facebook → Configuración → Cuentas vinculadas.
- **Administrador**: Facebook → la página → Acceso a la página (o Meta Business Suite → Configuración → Personas).

## 2. Qué se puede leer y hacer con la API de Meta (verificar)
- **Mensajes directos de Instagram y Messenger**: llegan por webhook a la misma app de Meta que ya usamos para WhatsApp. Hace falta que la cuenta de Instagram sea profesional y esté vinculada a la página de Facebook.
- **Comentarios** en publicaciones de Instagram y de Facebook: también por webhook (eventos de comentarios/«feed»).
- **Ventana de 24 horas** para responder mensajes (después hay límites; en Instagram es parecido).
- Permisos que se piden (nombres a confirmar): `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`.
- Para páginas y cuentas **propias** (de la misma empresa, administradas por quienes tienen rol en la app) normalmente alcanza el acceso estándar sin pasar por la «revisión de app» de Meta **(verificar)**. La revisión se pide si se quiere atender cuentas de terceros.
- La app tiene que estar en modo «en vivo». La app «Poliplast CRM Prueba» ya quedó publicada el 28/10.

## 3. Cómo encajaría en el CRM
- **Reusar** el receptor de webhooks que ya anda (`api/whatsapp-webhook.js`, firma con el secreto de la app, `event_id` único) en vez de crear otro: el límite de 12 funciones de Vercel no deja sumar archivos nuevos. Se agrega el reconocimiento de eventos `instagram` y `page`.
- **Por revisar**: los mensajes de Instagram y Facebook aparecen en la misma bandeja, con pestaña por canal y color, como ya se hizo con las líneas de WhatsApp. Cada persona ve los canales donde es miembro.
- **Comentarios**: una lista aparte («Comentarios por responder»), porque no son una conversación.
- **Alerta de línea**: igual que WhatsApp, avisa si una cuenta se desconecta o pierde la suscripción (por cuenta, no por cantidad de mensajes).
- Tablas nuevas probables: canales sociales (página, cuenta de Instagram, token de página guardado en el servidor, nunca en el navegador) y eventos sociales. Migración con OK de Felipe.

## 4. Etapas (mismo criterio que WhatsApp: primero leer, después sugerir, al final responder con aprobación)
1. **Conexión y lectura**: conectar cada página/cuenta, recibir mensajes y comentarios, verlos en Por revisar. No se responde desde el CRM.
2. **Respuestas sugeridas** (borrador con el asistente, la persona copia y manda desde Instagram/Facebook) y aviso de lo que hay que atender.
3. **Responder desde el CRM** con aprobación de una persona, dentro de la ventana de 24 horas y con pausa de emergencia.
4. Después, si sirve: **señal «redes activas»** de prospección usando la API de las cuentas propias (no se puede leer Instagram/Facebook de terceros sin sus APIs).

## 5. Riesgos y cosas que no se pueden prometer
- Si alguna cuenta de Instagram es personal o no está vinculada a una página, no hay API: primero se corrige eso.
- Los tokens de página caducan o se invalidan si cambia la contraseña o los roles del administrador: se necesita el aviso de «línea desconectada».
- Responder mensajes en forma automática tiene reglas de Meta (consentimiento, ventana, un humano disponible) **(verificar)**: por eso la etapa 3 es con aprobación.
- Nada de esto se puede probar sin las cuentas reales: la primera prueba es con una cuenta de Felipe como administrador.

## 6. Primer paso cuando vuelva Felipe
1. Completar la tabla del punto 1.
2. Confirmar en cuál portfolio/app de Meta están las páginas (la app «Poliplast CRM Prueba» es la candidata, ID 1120091094157805).
3. Con eso se arma la etapa 1 (lectura) y se prueba con una sola cuenta antes de sumar las demás.
