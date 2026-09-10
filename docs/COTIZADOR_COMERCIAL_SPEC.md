# Catálogo y cotizador comercial unificado — Grupo Poliplast

**Estado:** especificación funcional v3
**Fecha:** 10/09/2026  
**Alcance:** todos los productos, variantes, familias, subfamilias y marcas comercializadas por Grupo Poliplast.

## 1. Decisión de producto

No se construirán cotizadores separados para Resinplast, Penosil, PURMAC, PRFV o Baldes.

Se construirá una única herramienta comercial interna **separada del CRM en su primera etapa**, que funcione como:

- catálogo navegable de todo Grupo Poliplast;
- buscador de productos y variantes;
- cotizador para un cliente concreto;
- generador de listas de precios por familia, subfamilia o selección;
- punto de acceso a fichas técnicas vigentes;
- memoria operativa de precios, presentaciones, reglas y condiciones.

La experiencia puede parecerse a Shopify por su facilidad para recorrer productos y variantes, pero Shopify no será la fuente canónica ni el cotizador será una tienda pública. El objetivo es que el vendedor encuentre y prepare una propuesta sin volver a preguntar dónde está cada precio, variante o ficha.

Tendrá interfaz y despliegue propios para no aumentar la complejidad ni el riesgo operativo del CRM. Compartirá una base comercial gobernada y dejará preparada una integración futura por identificadores estables y API. Separar la aplicación no significa duplicar catálogo, precios o fichas.

## 2. Jerarquía única del catálogo

La navegación y el modelo deben respetar esta estructura:

1. Unidad de negocio o marca comercial.
2. Familia.
3. Subfamilia.
4. Producto.
5. Variante o SKU.

Una variante puede cambiar presentación, tamaño, color, espesor, volumen, formato de venta, moneda, unidad de medida o cualquier otro atributo comercial. Producto y variante no deben confundirse.

El sistema debe permitir buscar y filtrar por nombre, SKU, marca, familia, subfamilia, estado comercial, disponibilidad de precio, disponibilidad de ficha técnica y lista aplicable.

## 3. Fuentes y autoridad de los datos

Cada tipo de dato tendrá una fuente explícita:

- **Catálogo Maestro:** identidad, clasificación, familia, subfamilia, nombre y SKU canónico.
- **Listas comerciales verificadas:** precios, moneda, IVA, vigencia, escalas y condiciones.
- **Contabilium:** costos, stock o precios cuando la integración esté disponible y validada.
- **Shopify:** referencia para títulos, descripciones, imágenes y variantes publicadas; no reemplaza al Catálogo Maestro.
- **Drive/Base de conocimiento técnica:** fichas técnicas y documentos comerciales vigentes.
- **Felipe/equipo autorizado:** validaciones y excepciones que no estén documentadas.

Nunca se debe inferir un precio por similitud de nombre ni publicar como vigente un dato sin fuente y fecha.

La fuente canónica de identidad y taxonomía es `Catalogo_Maestro_v12_LIMPIO_FINAL.xlsx` de la carpeta de Drive indicada por Felipe. Su corte declara 1.749 productos vigentes, 285 excluidos y 0 pendientes de clasificación. `carga productos.xlsx` complementa costos, precios y datos operativos, pero no reemplaza las decisiones de Familia/Subfamilia de la v12.

## 4. Modelo mínimo

- `brands`: identidad visual y reglas por marca.
- `families` y `subfamilies`: taxonomía comercial.
- `products`: producto conceptual.
- `variants`: SKU, presentación, unidad y atributos.
- `price_lists`: nombre, moneda, IVA, vigencia, fuente y estado.
- `price_tiers`: precio por variante, rango de cantidad o condición.
- `technical_documents`: ficha, versión, vigencia, origen y alcance.
- `product_documents`: vínculo documento-producto/variante/subfamilia.
- `quotes` y `quote_items`: cliente, vendedor, vigencia, productos, precios y estado.
- `brand_templates`: logos, colores y reglas de co-branding.
- `inventory_locations`: depósitos y ubicaciones físicas.
- `inventory_counts` y `inventory_count_lines`: sesiones y líneas del conteo físico.
- `inventory_balances`: último stock aprobado por variante y depósito.
- `import_jobs` e `import_rows`: lote importado, vista previa, errores y resultado por fila.
- `audit_log`: cambios administrativos con usuario, fecha, origen y valores anterior/nuevo.

Los identificadores deben ser estables. Una corrección de nombre no puede crear otro producto ni perder historial.

Costo, precio, markup y margen son campos separados. El usuario autorizado podrá elegir si calcula desde markup sobre costo o desde margen sobre venta; el sistema siempre mostrará ambos resultados efectivos para evitar confundirlos. Todo cambio conservará responsable, fecha, fuente y valor anterior. Un precio mayorista pendiente permanece vacío hasta recibir una fuente o decisión explícita.

## 4.1 Roles y alcance de edición

- **Administrador:** importa/exporta, crea y corrige productos/variantes, administra costos, listas, márgenes, stock aprobado, usuarios y reglas.
- **Responsable comercial autorizado:** edita listas y excepciones dentro de sus permisos; no administra usuarios ni borra historial.
- **Vendedor:** consulta catálogo, precio vigente y disponibilidad; crea cotizaciones. No ve costo ni rentabilidad salvo autorización explícita.
- **Consulta:** solo lectura.

Ocultar botones no constituye seguridad. Los permisos se aplican también en Supabase mediante autenticación, RLS y operaciones de servidor. El PIN local del prototipo de inventario no habilita funciones administrativas en producción.

## 4.2 Administración masiva

La versión administrador ofrecerá dos formas equivalentes de mantener datos:

1. edición directa en grilla, con filtros, selección múltiple y cambios por lote;
2. importación CSV/XLSX mediante plantilla versionada.

Cada importación seguirá este flujo obligatorio:

1. cargar archivo;
2. identificar tipo de importación: catálogo, costos, precios, stock o documentos;
3. mapear columnas y validar moneda, números, fechas, SKU y unidades;
4. mostrar una vista previa separando altas, modificaciones, filas sin cambios, conflictos, duplicados y errores;
5. descargar el reporte de errores antes de aplicar;
6. confirmar el lote completo;
7. aplicar de forma atómica o registrar claramente las filas rechazadas;
8. conservar un identificador de lote y permitir revertir todos sus cambios sin afectar modificaciones posteriores ajenas al lote.

El SKU identifica la variante, pero no autoriza a crearla silenciosamente durante una actualización de costos o stock. Los SKU ausentes, repetidos o desconocidos quedan bloqueados para revisión.

Las exportaciones permiten elegir campos, filtros y alcance. Habrá una plantilla administrativa completa y exportaciones restringidas para vendedores, sin costo ni margen confidencial.

## 5. Experiencia comercial

1. Buscar o navegar por familia y subfamilia.
2. Ver imagen, usos, presentaciones, variantes, precios y fecha de vigencia.
3. Elegir variante y cantidad.
4. Aplicar la escala válida; una excepción manual exige motivo.
5. Agregar productos de una o varias familias a una misma cotización.
6. Elegir el cliente o completar sus datos básicos; la vinculación automática con el CRM será posterior.
7. Sugerir las fichas técnicas correspondientes.
8. Mostrar una vista previa antes de guardar o exportar.
9. Emitir PDF de cotización o lista de precios.
10. Guardar la operación en el historial comercial del cliente.

También existirá un modo **Lista de precios**, sin cliente obligatorio, para seleccionar una familia, subfamilia o conjunto de productos y generar un PDF comercial.

## 6. Identidad visual

El logo de **Grupo Poliplast debe aparecer siempre**.

- **Penosil:** colores y logo de Penosil + Grupo Poliplast.
- **Resinplast:** colores y logo de Resinplast + Grupo Poliplast.
- **PURMAC:** colores y logo de PURMAC + Grupo Poliplast.
- **Otras familias:** identidad de Grupo Poliplast hasta que Felipe entregue una marca específica.
- **Cotización mixta:** identidad principal de Grupo Poliplast; cada sección puede indicar su marca, sin convertirse en varias cotizaciones.

Esto se resolverá mediante configuración de marca, no con aplicaciones o código duplicado por familia.

## 7. Fichas técnicas y adjuntos

Una ficha podrá asociarse a una subfamilia, producto, variante o combinación de productos. Al cotizar, el sistema sugerirá los documentos aplicables y el vendedor decidirá cuáles adjuntar.

Solo se ofrecerán documentos vigentes y validados en la base de conocimiento. Si falta una ficha o existen versiones conflictivas, se mostrará la advertencia y no se inventará contenido.

La primera versión puede incluir enlaces controlados a Drive. Una posterior podrá anexar automáticamente las fichas al PDF o al mensaje de envío.

## 8. Reglas ya conocidas

- **Resinplast:** listas Mayorista y CF 2026, conservando condiciones y escalas documentadas.
- **Baldes:** precios con IVA y escalas por cantidad/bulto según lista vigente.
- **PRFV:** precio por m², dimensiones/espesor y rollo cerrado; mínimo inicial de 100 metros, sujeto a validación.
- **Penosil:** mayorista según lista vigente; minorista desde fuente autorizada, sin asumir automáticamente un 10% si no fue validado.
- **Resto:** se incorpora con identidad y variantes aunque no tenga precio cotizable; debe figurar como `precio pendiente`, no quedar excluido.

## 9. Primera implementación

La primera versión no será “el cotizador de Resinplast”. Debe crear la base horizontal para todas las familias:

1. modelo unificado de catálogo y variantes;
2. importación con vista previa y reporte de errores;
3. navegador con filtros de familia/subfamilia/SKU;
4. carga de todos los productos identificados, aunque algunos tengan precio pendiente;
5. motor genérico de listas, escalas, IVA, moneda y vigencia;
6. identidad visual configurable por marca;
7. asociación y sugerencia de fichas técnicas;
8. cotización y lista de precios en PDF;
9. identificadores estables para una futura vinculación con cliente e historial del CRM.
10. panel administrador para edición individual y masiva;
11. importación/exportación CSV/XLSX con vista previa, auditoría y reversión;
12. lectura del stock aprobado por depósito desde la capa compartida de inventario.

Las familias verificadas pueden habilitarse para cotizar primero, pero sin crear una arquitectura exclusiva que luego haya que rehacer.

## 10. Seguridad y trazabilidad

- Cada cotización guarda la lista, precio y vigencia utilizados.
- Cambiar una lista futura no altera cotizaciones históricas.
- El precio manual queda marcado como excepción, con usuario y motivo.
- El PDF indica moneda, IVA, vigencia y condiciones.
- Los documentos técnicos muestran fuente y fecha de verificación.
- Ninguna importación sobrescribe datos en silencio: siempre hay vista previa de altas, cambios, conflictos y descartes.
- Costos, márgenes y rentabilidad requieren rol administrativo tanto en la interfaz como en la base.
- Cada importación registra archivo, hash, usuario, fecha, tipo, totales y resultado por fila.
- El sistema conserva historial; una corrección revierte una revisión o lote, no borra evidencia.
- La exportación respeta permisos y nunca incluye costos por defecto.

## 10.1 Integración con el sistema de inventario

El sistema existente de conteo físico se reutilizará como interfaz operativa, no como segunda fuente de catálogo. Su catálogo interno y sus `overrides` deben migrar o mapearse al catálogo canónico antes de una integración productiva.

Flujo objetivo:

1. el cotizador y el contador leen las mismas variantes canónicas;
2. el operario cuenta por depósito y SKU;
3. un responsable revisa y cierra la sesión;
4. recién el conteo aprobado actualiza `inventory_balances`;
5. el cotizador muestra stock total y por depósito, con fecha del último conteo;
6. el vendedor puede cotizar sin prometer disponibilidad cuando el dato está vencido o sin aprobar.

Se distinguirán tres conceptos:

- **conteo físico:** lo observado durante una sesión;
- **stock aprobado:** último saldo validado por depósito;
- **stock disponible para prometer:** saldo aprobado menos reservas/compromisos, cuando exista esa integración.

Hasta integrar movimientos, reservas y ventas, el sistema mostrará `stock contado al [fecha]`, no `stock disponible`.

## 11. Criterios de aceptación

1. Se encuentra cualquier producto o variante del Catálogo Maestro.
2. Cada producto aparece una sola vez, con sus variantes debajo.
3. Los productos sin precio siguen visibles y claramente marcados.
4. Se cotiza una selección de una o varias familias.
5. Escala, moneda e IVA se calculan y muestran correctamente.
6. El PDF aplica la marca correcta y siempre incluye Grupo Poliplast.
7. Una cotización mixta conserva una identidad coherente.
8. Se sugieren las fichas correctas y se pueden seleccionar adjuntos.
9. La cotización queda vinculada al cliente con snapshot histórico.
10. Ninguna cifra o ficha sin fuente validada aparece como definitiva.
11. Un administrador puede actualizar costos o precios en lote y revertir el lote.
12. Un vendedor no puede leer costos ni márgenes desde UI ni API.
13. Una importación con SKU desconocido o duplicado no altera producción.
14. El stock mostrado indica depósito, estado de aprobación y fecha de corte.
15. Cotizador e inventario resuelven el mismo SKU al mismo identificador de variante.

## 12. Orden recomendado

1. Auditar Catálogo Maestro, Shopify, listas y Drive; producir mapa de campos y conflictos.
2. Cerrar taxonomía familia/subfamilia/producto/variante y normalización de SKU.
3. Construir el catálogo interno completo con importador seguro.
4. Implementar motor genérico de precios y habilitar primero las listas verificadas.
5. Configurar marcas de Grupo Poliplast, Penosil, Resinplast y PURMAC.
6. Vincular fichas técnicas gobernadas.
7. Generar cotización y lista de precios en PDF.
8. Integrar con clientes, historial y seguimiento del CRM cuando el cotizador independiente esté validado.
9. Evaluar lectura automática desde Contabilium y otras sincronizaciones.
10. Migrar el prototipo de conteo a autenticación/RLS y catálogo compartido antes de conectarlo al cotizador.

## 13. Decisiones pendientes

- Fuente canónica y frecuencia de actualización de precios por familia.
- Reglas de descuentos y quién puede autorizarlos.
- Condiciones fiscales y comerciales por unidad.
- Logos originales y manuales de marca de Resinplast, PURMAC y futuras familias.
- Si el primer PDF adjunta fichas completas o entrega enlaces controlados.
- Qué roles concretos pueden ver costo/margen y aprobar stock.
- Política para stock vencido y umbral de alerta por depósito.
- Si las reservas comerciales se incorporan antes o después de Contabilium.

Estas decisiones no bloquean la auditoría ni el diseño horizontal.

## 14. Auditoría inicial de la semilla actual

Verificación automática del 10/09/2026 sobre `src/product-catalog.mjs`:

- 59 variantes.
- 30 agrupaciones iniciales de producto.
- 0 variantes sin SKU.
- 1 SKU duplicado entre dos productos diferentes.
- 9 variantes sin subfamilia definida.
- Resultado: **la semilla todavía no es importable**; debe pasar por revisión humana.

### Conflicto de SKU

`PS-EMPU46MSP-1` aparece tanto en “Espuma Multiuso PU-46 - Manual X1” como en “Espuma Multiuso PU-46 - Pistola X1”. Los SKU X6/X12 sugieren patrones distintos, pero el valor correcto debe confirmarse contra una fuente comercial; no se corrige por inferencia.

### Subfamilias pendientes

- Baldes: `BLBL-10-1`, `BLBL-10-3`, `BLBL-20-1`, `BLBL-20-3`.
- AGLUPLAST: `PU-A1150-2`, `PU-A1150-4`.
- Pisos: `AF-PG-MONEDA-NEG-2.5MM-1M2`, `AF-100-RUL-GRIS-1M2`, `AF-100-ZZ-GRIS-5MM-1M2`.

El motor que produce este informe está en `src/unified-commercial-catalog.mjs`. Bloquea una importación con SKU duplicado o ausente, agrupa variantes, filtra el catálogo, resuelve el co-branding y sugiere únicamente fichas técnicas vigentes.
