# Cómo una tarea programada deja hallazgos en el CRM

Las tareas programadas (Shopify, Mercado Libre) dejan hallazgos accionables en la bandeja **Tareas**
con `POST /api/tasks-intake` (`api/tasks-intake.js`, lógica en `lib/tasks-intake.mjs`).

- URL: `https://poli-crm.vercel.app/api/tasks-intake`
- Header: `Authorization: Bearer <TASKS_API_SECRET>` (la misma variable de Vercel que ya usa la tarea de Mercado Libre; el secreto **no** se escribe en este repo).
- Sin credencial responde `401` (así se comprueba que está vivo sin escribir nada).
- Si el `externalId` ya existe, **no crea otra tarea** (`wasNew: false`): repetir un hallazgo es seguro.

## Texto para pegar en la tarea programada de Shopify

> Al terminar la auditoría, por cada hallazgo accionable (máximo 10 por corrida, los más importantes) dejá una tarea en el CRM:
>
> `POST https://poli-crm.vercel.app/api/tasks-intake` con `Content-Type: application/json` y `Authorization: Bearer <TASKS_API_SECRET>` (el mismo secreto que usa la tarea de Mercado Libre).
>
> Cuerpo:
> `{"externalId":"shopify-<tema>-<handle o SKU>","origin":"Automatización Shopify","title":"<acción concreta, hasta 90 caracteres>","description":"<qué pasa, dónde y cómo se arregla>","priority":"Alta|Media|Baja","dueDate":"AAAA-MM-DD"}`
>
> - `externalId` estable: si el mismo problema vuelve a aparecer en otra corrida, repetí **el mismo** `externalId` (no se duplica).
> - No envíes hallazgos ya resueltos ni meramente informativos.
> - Si el POST falla, no reintentes en bucle: anotalo en el resumen de la corrida.

Campos: `externalId`, `origin`, `title` son obligatorios; `description`, `category`, `priority` (`Alta`/`Media`/`Baja`) y `dueDate` (`AAAA-MM-DD`) son opcionales.

## Si no llega nada

1. ¿La tarea corre dentro del entorno de Cowork? Ese entorno bloquea dominios que no estén en su lista permitida: hay que habilitar `poli-crm.vercel.app`.
2. Revisar la respuesta del POST: `401` = falta o está mal el secreto; `400` = el cuerpo no cumple los campos de arriba; `500` = revisar los logs de Vercel (`tasks-intake`).
3. Control rápido: en el CRM, Tareas → buscar por origen "Automatización Shopify"; la fecha de la última tarea dice cuándo llegó lo último.
