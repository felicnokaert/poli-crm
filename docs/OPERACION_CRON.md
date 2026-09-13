# Operación del cron diario de mantenimiento

`api/cron-daily-maintenance.js` corre una vez por día (definido en `vercel.json`,
horario UTC) y aplica sobre CADA workspace guardado en `workspace_states`:

1. Cierra las tareas vencidas (mismo criterio que usa el CRM cuando alguien lo
   abre, ver `src/daily-maintenance.mjs`).
2. Calcula y persiste las 3 señales de negocio del Dashboard (hot leads sin
   responder, cotizaciones frías, radar de recompra) en `data.dailySignals`.
3. Crea tareas de seguimiento automáticas para los hot leads detectados
   (`source: "auto-hot-lead"`, prioridad Alta) y para las cotizaciones frías
   (`source: "auto-cold-quote"`, prioridad Media), sin duplicar si ya existe
   una tarea abierta para ese contacto y esa señal. El radar de recompra no
   crea tareas automáticas — queda solo como dato para revisar en Inicio,
   porque su acción correcta es ambigua sin detalle de producto.

Existe para que esto pase todos los días aunque nadie abra el CRM (antes solo
corría client-side, al abrir la pestaña).

## Cómo leer la respuesta

El endpoint responde JSON con, entre otros campos: `workspacesProcessed`,
`workspacesUpdated`, `workspacesFailed`, `tasksClosed` y un array `results`
con un objeto por workspace (`workspaceKey`, `changed`, `ok`, y si falló,
`error`). Cada fila se procesa de forma independiente: si una falla (por
ejemplo, un PATCH a Supabase que agota los reintentos), las demás igual se
procesan y se guardan — no hace falta que un workspace roto tire abajo el
mantenimiento del resto. `ok: false` a nivel raíz solo significa que alguna
fila individual falló, no que el cron entero se cayó.

El cron también devuelve un resumen legible en español (una línea de
descripción más el desglose por señal). El CRM lo usa en Inicio para mostrar
"El sistema generó N tareas automáticas hoy" (o "no generó" si no hubo
ninguna), contando las tareas con `source` `auto-hot-lead` o `auto-cold-quote`
creadas ese mismo día — es la forma de auditar, desde la propia app, qué
hizo el cron sin tener que ir a mirar logs de Vercel.

## Si un día no se crearon tareas automáticas

1. Mirar los logs de la función en el dashboard de Vercel
   (Project → Deployments → Functions → `cron-daily-maintenance`, o
   `vercel logs`). Cada error de fila se loguea con su `workspaceKey` y el
   paso donde falló.
2. Confirmar que la variable de entorno `CRON_SECRET` está configurada en
   Vercel y coincide con la que usa el cron de Vercel para el header
   `Authorization: Bearer <CRON_SECRET>` — sin ese secret configurado, el
   endpoint responde 401 y no corre nada (fail-safe intencional).
3. Si el log muestra que `fetchWorkspaceRows` falló, es un problema de
   Supabase (URL/API key o el servicio caído) y sí afecta a todos los
   workspaces — revisar `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
4. Si solo un workspace puntual aparece con `ok: false` en `results`, el resto
   corrió bien: no hace falta re-correr todo, alcanza con investigar ese
   workspace (por ejemplo, re-disparar el mantenimiento la próxima corrida
   diaria, o revisar manualmente esa fila en `workspace_states`).
