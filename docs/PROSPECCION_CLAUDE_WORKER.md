# Investigación profunda desde la app, hecha por Claude (sin costo de API)

**Cómo funciona**
1. En Prospección, el botón **"Pedir a Claude que investigue"** guarda un pedido (familia, alcance, cantidad, empresas a excluir y las reglas de la guía) en la tabla `prospect_requests`.
2. En tu sesión de Claude Code (tu suscripción, no la API) decís: **"procesá los pedidos de Prospección"**.
3. Claude toma los pedidos con `status = 'pendiente'`, los marca `en_curso`, investiga en la web de verdad (búsquedas, lectura de los sitios, verificación de cada dato con su fuente), y guarda una tabla markdown en `result_markdown` con `status = 'lista'`.
4. La app (consulta cada 20 s) muestra "Resultado listo"; con **"Revisar resultado"** ves cuántas son nuevas, cuáles ya están en el CRM y cuáles son duplicadas, y confirmás la importación.

**Instrucciones para Claude al procesar (hacerlo así)**
- Leer: `select id, family, scope, wanted, notes, prompt from prospect_requests where status = 'pendiente' order by created_at`.
- Marcar el pedido `en_curso` y actualizar `progress` con frases cortas mientras avanza ("buscando en Rosario", "verificando 8 sitios").
- Investigar siguiendo el campo `prompt` tal cual (incluye razonamiento previo, señales que confirman, exclusiones y columnas de la tabla). Usar búsqueda web y lectura de cada sitio; no inventar datos; una fila solo si hay fuente verificada; cada fila lleva el link de la evidencia.
- Preferir pocas filas verificadas a muchas dudosas. Tardar lo que haga falta.
- Escribir `result_markdown` (tabla con las columnas exactas del pedido; las descartadas aparte, con motivo), `result_count`, `status = 'lista'`. Si falla, `status = 'error'` y `progress` con el motivo.
- No tocar el workspace del usuario ni la tabla de prospectos: la app es quien importa.

**Límites honestos**
- No es instantáneo: depende de que le pidas a Claude que procese (o de programar una tarea que lo haga cada cierto tiempo).
- Consume el uso de tu suscripción de Claude, no crédito de API.

## Procesamiento automático (tarea programada, cuenta de marketing)
Una tarea programada de Claude (cuenta marketing@grupopoliplast.com.ar, sin API) corre cada hora y procesa los pedidos pendientes. Tipos de pedido, por el prefijo de `family`:
- **Familia normal** (Penosil, Carrozados, etc.): prospección; seguir las instrucciones de arriba.
- **`COMPETENCIA: <nombre>`**: profundizar una ficha existente. Investigar según el `prompt` y guardar el informe en `result_markdown`.
- **`COMPETENCIA NUEVA: <nombre>`**: un comercial cargó un competidor (nombre y/o web/Facebook/Instagram en `scope`; familia sugerida en `notes`). Investigar en la web con fuente por dato (Facebook/Instagram suelen no poder leerse: usarlos solo para nombre y links). Si es un competidor real, hacer `insert into competitors` con `id` (slug), `name`, `kind` (fabricante/distribuidor/comercio/marca/equipos), `families` (de Penosil, Carrozados, Imperpur, Planchas, Resinplast, PURMAC, Poliurea, Poliuretano, Química), `summary`, `products`, `location`, `website`, `channels`, `sources` (json `[{"t","u"}]`), `caveats` (lo no verificado) y **`reviewed = false`**. Marcar el pedido `lista` con un resumen; si no es competidor real o no se encuentra, `status = 'error'` y `progress` con el motivo.

Reglas: nunca inventar datos; pocas fichas verificadas antes que muchas dudosas; máximo 5 pedidos por corrida (el resto queda `pendiente` para la próxima); no mandar mensajes a nadie; no borrar datos.

## Criterio de "competidor" (definido por Felipe, 15/10/2026)
- Los **aplicadores** de poliuretano proyectado (ej. Poliuretanos del Norte) **no son competencia: son clientes**. No cargarlos en `competitors`; si aparece uno, marcar el pedido `lista` explicando que es cliente potencial.
- Los que **venden máquinas** (Satch, Spinna, y quien confirme Felipe) **sí son competencia** (kind = `equipos`), porque compiten con la línea de equipos Purmac.
