# Catálogo y cotizador comercial unificado — Grupo Poliplast

**Estado:** especificación funcional v2
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

Los identificadores deben ser estables. Una corrección de nombre no puede crear otro producto ni perder historial.

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

Las familias verificadas pueden habilitarse para cotizar primero, pero sin crear una arquitectura exclusiva que luego haya que rehacer.

## 10. Seguridad y trazabilidad

- Cada cotización guarda la lista, precio y vigencia utilizados.
- Cambiar una lista futura no altera cotizaciones históricas.
- El precio manual queda marcado como excepción, con usuario y motivo.
- El PDF indica moneda, IVA, vigencia y condiciones.
- Los documentos técnicos muestran fuente y fecha de verificación.
- Ninguna importación sobrescribe datos en silencio: siempre hay vista previa de altas, cambios, conflictos y descartes.

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

## 13. Decisiones pendientes

- Fuente canónica y frecuencia de actualización de precios por familia.
- Reglas de descuentos y quién puede autorizarlos.
- Condiciones fiscales y comerciales por unidad.
- Logos originales y manuales de marca de Resinplast, PURMAC y futuras familias.
- Si el primer PDF adjunta fichas completas o entrega enlaces controlados.

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
