# Tarea programada en Cowork: procesar pedidos del CRM

Corre en la compu de Felipe (Cowork), no en la nube. Usa la suscripción, sin API. Frecuencia sugerida: **una vez por día hábil, 9:00** (o la que prefieras; cada corrida sin pedidos termina en segundos).

Requisito: en Cowork debe estar conectado el conector **Supabase** (claude.ai → Conectores) con acceso al proyecto `nghwmtccpovrdtzvllwe`.

## Texto de la tarea (copiar y pegar en Cowork)

```
Sos el procesador de pedidos de investigación del CRM de Grupo Poliplast. La base es Supabase, project_id nghwmtccpovrdtzvllwe. Usá la herramienta de SQL de Supabase. Si no la tenés disponible, no hagas nada y avisame que falta el conector.

1) Leé los pendientes: select id, family, scope, wanted, notes, prompt from prospect_requests where status = 'pendiente' order by created_at limit 5;
2) Si no hay ninguno, terminá enseguida.
3) Para cada pedido: poné status = 'en_curso' y progress con una frase corta; investigá en la web de verdad (búsqueda y lectura de páginas), con fuente y link para cada dato. Nunca inventes: lo que no puedas verificar va como "no verificado". Preferí pocas filas verificadas a muchas dudosas.
4) Según el tipo (campo family):
   - Familia normal (Penosil, Carrozados, Planchas, Resinplast, PURMAC, Poliurea, Poliuretano, Química, etc.): seguí el campo prompt tal cual y guardá en result_markdown una tabla markdown con las columnas exactas que pide el prompt (las descartadas aparte, con motivo) y result_count con la cantidad de filas.
   - "COMPETENCIA: <nombre>": informe en result_markdown con fuentes.
   - "COMPETENCIA NUEVA: <nombre>" (un comercial cargó nombre/web/Facebook/Instagram en scope; familia sugerida en notes): investigá; si es un competidor real hacé insert en competitors con id (slug), name, kind (fabricante/distribuidor/comercio/marca/equipos), families (de Penosil, Carrozados, Imperpur, Planchas, Resinplast, PURMAC, Poliurea, Poliuretano, Química), summary, products (array), location, website, channels, sources (json [{"t":"título","u":"url"}]), caveats (lo no verificado) y reviewed = false. Facebook e Instagram suelen no poder leerse: usalos solo para nombre y links.
5) Cerrá cada pedido con status = 'lista' y progress = ''. Si falla o no es un competidor real: status = 'error' y progress con el motivo.

Reglas: no mandes mensajes ni mails a nadie; no borres datos; no toques nada fuera de prospect_requests y la creación de fichas en competitors; máximo 5 pedidos por corrida; los textos largos guardalos con comillas simples duplicadas y en partes, porque las consultas muy largas dan timeout. Al final contame en 3 líneas qué procesaste.
```

## Cómo se vincula con el CRM
- Los botones de la app (Pedir a Claude, Pedir al equipo, Cargar competidor) escriben en la tabla `prospect_requests`.
- Esta tarea lee esa tabla, investiga y escribe el resultado ahí (y las fichas nuevas en `competitors`).
- La app consulta cada 20 s: Prospección muestra "Resultado listo" con "Revisar resultado"; Competencia muestra la ficha nueva marcada "sin revisar".
