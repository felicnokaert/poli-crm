# Informe: sección Prospección (primera entrega)

Rama: `claude/stoic-shannon-ev5nma` (no está en `main`; nada llegó a producción).
Tests: 604/604 en la primera entrega (ver 657/657 en la segunda). Build limpio.

## 1. Qué se construyó

| Pieza | Archivos |
|---|---|
| Modelo de prospectos: estados (No contactado / Contactado / Con interés / Sin interés), detalle opcional, familias con interruptor (Pisos y Almohadas pausadas), rubros editables, competidores, link de WhatsApp solo para celulares +54 9 y siempre "posible" | `src/prospect-model.mjs` |
| Detección de duplicados contra Empresas y contra otros prospectos: CUIT, teléfono (últimos 8 dígitos), sitio web (ignora redes sociales), nombre + localidad sin formas societarias, nombre parecido. Las dudosas se muestran como "Posible duplicado", nunca se ocultan | `src/prospect-dedupe.mjs` |
| Conversión a Empresa: al marcar Contactado o Con interés se crea la ficha (etapa "Apertura", familia del CRM) y se vincula en los dos sentidos; si ya existía, se vincula y solo se completan campos vacíos; repetir la marca no duplica | `src/prospect-convert.mjs` |
| Importador de listas (texto pegado o CSV con `;`, tab o `,`; encabezados como RELEVAMIENTO) | `src/prospect-import.mjs` |
| **Plan de hoy**: una familia por día hábil en rotación (editable), zonas sugeridas de mayor a menor población (INDEC 2022), alcance por familia (Baldes: CABA y Buenos Aires; Carrozados Imperpur: hasta 250 km de Mar del Plata, sin CABA), memoria de zonas buscadas (Pendiente / En curso / Agotada por ahora, que se revisa a los 60 días) | `src/prospect-plan.mjs` |
| **Lupa**: busca en OpenStreetMap por zona y rubros (radio según el tamaño de la ciudad), carga solo lo nuevo (por `osmId`), anota la búsqueda y muestra el motivo si falla | `lib/prospect-osm.mjs`, `api/prospeccion.js` (función 11 de 12), `vercel.json` (30 s) |
| Pantalla Prospección (menú Cartera): carga manual, pegar lista, filtros por familia y estado, marcas del equipo, "lista del día" (hasta 40 nuevos, sin duplicados, de familias activas), cobertura por familia y localidad | `src/Prospeccion.jsx`, `src/App.jsx` |
| Sincronización: `prospects` se guarda y fusiona como el resto de los registros del workspace | `src/workspace.mjs`, `src/online.js` |

Tests nuevos: duplicados (Pierandrei, Silvacom, CUIT/teléfono/web, el falso positivo "Imperio Motorhome" vs "IMPERIO S.R.L.", redes sociales, competidores), conversión, importador, sincronización y la pantalla de punta a punta.

## 2. Decisiones que se tomaron solas

1. **Los prospectos viven en el workspace de cada usuario** (`state.prospects`), igual que clientes y ventas. Consecuencias: no hay migración de base que aprobar, cada comercial ve solo los suyos, y nada toca las tablas de producción. Si más adelante hace falta consultarlos desde el servidor (cron, informes entre usuarios), se migran a tabla.
2. **Planchas y Química** no existen como familia del CRM: se prospectan con su nombre y la Empresa queda con la familia `Poliuretano` / `Otra`.
3. **Carrozados Imperpur** es una búsqueda aparte; la Empresa queda en la familia `Imperpur`.
4. La unidad de negocio de la Empresa convertida queda vacía (`businessUnit`): el CRM no tiene hoy ese campo en las fichas.

## 2 bis. Segunda entrega (seis pasos pedidos, en orden, un commit por paso)

Tests: 657/657, build limpio. Todo sigue en la rama; **nada en `main`**.

| Paso | Qué quedó | Archivos clave |
|---|---|---|
| 1. Foco por familia | Interruptor por familia: Pisos, Almohadas y Baldes arrancan **pausadas**; el plan nunca sugiere una pausada; "Foco de la semana" (ej. Resinplast) y línea "Foco vigente". Pausar conserva el avance de cobertura | `src/prospect-model.mjs`, `src/prospect-plan.mjs`, `src/Prospeccion.jsx` |
| 2. Diagnóstico por búsqueda | Cada búsqueda guarda devueltos / con teléfono / con web / nuevos / repetidos / ya en CRM / tiempo / intentos / servidor; resumen de una línea e historial; error claro en español y reintento con el segundo servidor de Overpass | `lib/prospect-osm.mjs`, `api/prospeccion.js` |
| 3. Importador | CSV o filas pegadas con las columnas de RELEVAMIENTO; mismo cruce de duplicados; vista previa con conteos; entra como "No contactado", fuente "importado" | `src/prospect-import.mjs` |
| 4. Mapa de Prospección | Pantalla propia (Cartera → Mapa de prospección), datos propios: pines por color de estado con agrupación, zoom, filtros (unidad, familia, estado, provincia, localidad, fechas) y tabla de **zonas con más déficit** (habitantes por prospecto/cliente de la familia en 50 km, mismo `calcularAlcance` del mapa de cobertura; sin datos, por población). **No muestra clientes del CRM**: los de POLIOCHO siguen solo en su mapa. Prueba de regresión con hashes de `public/mapa/*` | `src/prospect-map.mjs`, `src/ProspeccionMapa.jsx`, `src/prospect-coverage.mjs`, `test/mapa-poliocho-regresion.test.mjs` |
| 5. Enriquecimiento | Botón por prospecto con sitio web: lee la portada y `/contacto` de **su propio sitio** y completa solo campos vacíos: Facebook, Instagram, mail y WhatsApp (link `wa.me` solo si es +54 9, siempre "posible", va a notas). Respeta `robots.txt`, User-Agent propio, 6 s, 400 KB, 3 redirecciones, bloquea redes privadas. No entra a Instagram ni Facebook. Sin función nueva (acción `enrich` de `api/prospeccion.js`) | `lib/prospect-enrich.mjs`, `src/prospect-enrich-apply.mjs` |
| 6. Google Maps (opcional) | Adaptador Places **apagado**: exige `PROSPECT_GOOGLE_ENABLED=true` + `GOOGLE_PLACES_API_KEY` + `PROSPECT_GOOGLE_DAILY_CAP` (máx. 200) + claves de Supabase. El cupo se descuenta de forma atómica **antes** de consultar y falla cerrado. La interfaz solo muestra la fuente si el servidor la reporta activa. **No activado** | `lib/prospect-google.mjs`, `supabase/migrations/20261014180000_prospect_quota.sql` (**sin aplicar**) |

Sin hacer, como se pidió: panel de aprendizaje, competencia, skills.

### Ajuste del 14/10 (pedido de Felipe): dos mapas separados

- **Mapa de aplicadores (RAPYP)**: el mapa de cobertura de siempre, ahora abre filtrado a *Aplicadores* (se puede volver a "Todos"), con ranking y habitantes por aplicador. Los emails largos se ajustan a la ficha.
- **Mapa de ventas (resto)**: clientes que **no** son aplicadores + prospectos, con filtros (unidad, familia, estado, provincia, localidad, fechas) y dos tablas: "Dónde vendo" (por provincia) y "Ciudades grandes sin presencia" por familia. No usa el ranking habitantes por aplicador.
- Cambia el baseline de la prueba de regresión del mapa a propósito (solo título, filtro por defecto y CSS).

## 3. Pendiente y por qué

| Pendiente | Motivo |
|---|---|
| **Probar la lupa contra OpenStreetMap real (Penosil en Paraná) y comparar con Google Maps (9 resultados, todos con teléfono)** | La red del entorno de desarrollo bloquea `overpass-api.de`; el motor está probado solo con respuestas armadas a mano. El resumen de cada búsqueda está pensado para esa comparación |
| Confirmar `FAMILY_UNITS` (unidad de negocio por familia, filtro del mapa) | Los valores por defecto son una suposición (ej. Planchas → FOAM FACTORY, PURMAC/Poliurea → PURMAC) |
| Confirmar si PURMAC/Poliurea (aplicadores) deben salir de la tabla de déficit | La tabla suma clientes del CRM de la familia elegida; si esas familias son los aplicadores de POLIOCHO, conviene excluirlas para no mezclar |
| Radio de cobertura: 50 km en déficit vs 100 km por defecto del mapa de cobertura | Decisión de criterio; se cambia en `DEFAULT_COVERAGE_RADIUS_KM` |
| Adaptador de Google: aplicar la migración y configurar variables | Solo si se decide activarlo (cuesta por consulta) |
| Enriquecimiento probado solo con respuestas de ejemplo | Probar con 3 o 4 sitios reales de ferreterías |
| Panel de aprendizaje, competencia, skills | Explícitamente postergado |
| Higiene de datos (familias mal escritas, "Sin definir", sin provincia) | Sin acceso a la exportación |

## 4. Correcciones al prompt original

- El ID del proyecto Supabase es `nghwmtccpovrdtzvllwe` (el prompt tenía una letra de más).
- La rama principal es `main`, no `master`.
- La base de tests es 569, no 458.
- Cada comercial tiene su propio workspace (clave = id de usuario); no hay "una cartera de Felipe y otras 3 sin uso".
- **Un deploy de preview no aísla producción**: en Vercel `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` aplican a Preview *y* Production, y `VITE_SUPABASE_URL/ANON_KEY` solo a Production. Probablemente el front de un preview corra sin base (modo local), pero sus endpoints sí hablan con la base real.
- Hoy hay 10 funciones en `api/` y el plan Hobby permite 12: el motor de búsqueda cabe como una más.

## 5. Riesgos

- WhatsApp: la lista del día no envía nada; el link `wa.me` es manual. No automatizar envíos masivos (riesgo de bloqueo del número).
- Una versión vieja del CRM abierta en el navegador no conoce `prospects` y, al guardar, podría descartarlos hasta que recargue (afecta solo prospectos, no clientes).
- Los prospectos cargados quedan en el workspace real de quien los use: probar con datos de ejemplo.

## 6. Pasos para publicar

1. Hacer la prueba real de la lupa en un preview de la rama (ojo: los endpoints de preview hablan con la base real; usar la cuenta de prueba). Anotar devueltos / con teléfono / nuevos del resumen de la búsqueda.
2. Probar el importador con una lista chica y el botón de enriquecimiento con 3 o 4 sitios.
3. Revisar el mapa de Prospección y confirmar `FAMILY_UNITS`.
4. Confirmar con Felipe y recién entonces **merge a `main`** (= producción en Vercel). Sin migraciones obligatorias y sin variables nuevas. `vercel.json` suma `maxDuration` de 30 s para `api/prospeccion.js`. Hay 11 de 12 funciones en `api/`.
5. Google Maps queda apagado. Para activarlo más adelante: aplicar `20261014180000_prospect_quota.sql`, definir las tres variables en Vercel y revisar el costo contra el tope diario.
