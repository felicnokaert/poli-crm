# Informe: sección Prospección (primera entrega)

Rama: `claude/stoic-shannon-ev5nma` (no está en `main`; nada llegó a producción).
Tests: 590/590 (la base tenía 569). Build limpio.

## 1. Qué se construyó

| Pieza | Archivos |
|---|---|
| Modelo de prospectos: estados (No contactado / Contactado / Con interés / Sin interés), detalle opcional, familias con interruptor (Pisos y Almohadas pausadas), rubros editables, competidores, link de WhatsApp solo para celulares +54 9 y siempre "posible" | `src/prospect-model.mjs` |
| Detección de duplicados contra Empresas y contra otros prospectos: CUIT, teléfono (últimos 8 dígitos), sitio web (ignora redes sociales), nombre + localidad sin formas societarias, nombre parecido. Las dudosas se muestran como "Posible duplicado", nunca se ocultan | `src/prospect-dedupe.mjs` |
| Conversión a Empresa: al marcar Contactado o Con interés se crea la ficha (etapa "Apertura", familia del CRM) y se vincula en los dos sentidos; si ya existía, se vincula y solo se completan campos vacíos; repetir la marca no duplica | `src/prospect-convert.mjs` |
| Importador de listas (texto pegado o CSV con `;`, tab o `,`; encabezados como RELEVAMIENTO) | `src/prospect-import.mjs` |
| Pantalla Prospección (menú Cartera): carga manual, pegar lista, filtros por familia y estado, marcas del equipo, "lista del día" (hasta 40 nuevos, sin duplicados, de familias activas), cobertura por familia y localidad | `src/Prospeccion.jsx`, `src/App.jsx` |
| Sincronización: `prospects` se guarda y fusiona como el resto de los registros del workspace | `src/workspace.mjs`, `src/online.js` |

Tests nuevos: duplicados (Pierandrei, Silvacom, CUIT/teléfono/web, el falso positivo "Imperio Motorhome" vs "IMPERIO S.R.L.", redes sociales, competidores), conversión, importador, sincronización y la pantalla de punta a punta.

## 2. Decisiones que se tomaron solas

1. **Los prospectos viven en el workspace de cada usuario** (`state.prospects`), igual que clientes y ventas. Consecuencias: no hay migración de base que aprobar, cada comercial ve solo los suyos, y nada toca las tablas de producción. Si más adelante hace falta consultarlos desde el servidor (cron, informes entre usuarios), se migran a tabla.
2. **Planchas y Química** no existen como familia del CRM: se prospectan con su nombre y la Empresa queda con la familia `Poliuretano` / `Otra`.
3. **Carrozados Imperpur** es una búsqueda aparte; la Empresa queda en la familia `Imperpur`.
4. La unidad de negocio de la Empresa convertida queda vacía (`businessUnit`): el CRM no tiene hoy ese campo en las fichas.

## 3. Pendiente y por qué

| Pendiente | Motivo |
|---|---|
| **Motor de búsqueda (OpenStreetMap / Overpass) y la prueba comparativa con las 40 de Entre Ríos** | **La red de la sesión en la nube bloquea `overpass-api.de` y `nominatim.openstreetmap.org` (403 del proxy).** No se simuló: el botón "Buscar" está deshabilitado con un aviso. Para habilitarlo hay que permitir esos dominios en el entorno de la sesión (Network access) |
| Mapa de Prospección separado + prueba de regresión del mapa POLIOCHO | Etapa 6 sin empezar. Depende de tener prospectos con coordenadas (viene del motor de búsqueda) |
| Enriquecimiento (redes, WhatsApp, email desde el sitio de la empresa) | Etapa 7 sin empezar. Requiere salida a internet |
| Panel de aprendizaje, hipótesis, competencia | Etapas 8 y 9 sin empezar |
| Higiene de datos en "dry run" (familias mal escritas, 258 "Sin definir", ~200 sin provincia) | No hay acceso a la exportación CSV; `canonicalFamily` ya cubre parte |
| Tarjeta en Trello | No se pidió operar Trello en esta sesión |

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

## 6. Cómo aprobar

1. Revisar la rama `claude/stoic-shannon-ev5nma` (o el PR si se abre).
2. Probar con una cuenta de prueba (marketing@): menú Cartera → Prospección.
3. Merge a `main` cuando esté conforme. No hay migraciones.
4. Para habilitar la búsqueda: permitir `overpass-api.de` y `nominatim.openstreetmap.org` en el entorno y volver a pedir la etapa 3 con la prueba comparativa.
