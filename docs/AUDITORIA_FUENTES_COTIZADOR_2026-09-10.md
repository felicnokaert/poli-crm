# Auditoría inicial de fuentes para el catálogo/cotizador

**Fecha:** 10/09/2026  
**Tipo:** lectura; no se modificaron fuentes ni datos productivos.

## Resultado ejecutivo

Ya existe trabajo reutilizable, pero no existe todavía una fuente única que represente todo el universo comercial.

La base más preparada encontrada es `outputs/catalogo_whatsapp_reintento/catalogo_candidatos_auditado.csv`. Contiene 59 variantes y sirve como semilla validada para identidad, descripción, imagen y parte de los precios. No debe confundirse con el Catálogo Maestro completo: nació para revisar el catálogo de WhatsApp y deja familias enteras vacías.

## Cobertura de la semilla auditada

| Familia | Variantes |
| --- | ---: |
| Penosil | 23 |
| Resinplast | 10 |
| Poliuretanos | 9 |
| Poliurea | 6 |
| Baldes | 4 |
| Pisos | 3 |
| PURMAC | 2 |
| Otros | 2 |
| Carrozados | 0 |
| EPP | 0 |
| **Total** | **59** |

Estado operativo del lote:

- 46 variantes con SKU/identidad comparados con el maestro.
- 8 variantes cuyo SKU requiere reconciliación.
- 5 variantes sin stock confirmado.
- 29 filas con acción recomendada `CORREGIR`.
- 30 filas con acción recomendada `REVISAR`.
- Ninguna fila está lista para publicación automática.

## Conflicto bloqueante confirmado

El SKU `PS-EMPU46MSP-1` está asignado a:

1. Espuma Multiuso PU-46 - Manual X1.
2. Espuma Multiuso PU-46 - Pistola X1.

Debe verificarse contra una lista o sistema autorizado. El patrón de otros packs puede servir como pista, nunca como autorización para corregirlo.

## Fuentes localizadas

### Identidad y clasificación

- `GrupoPoliplast_Catalogo_Maestro_Familias_v6.xlsx`.
- Semilla auditada de WhatsApp y sus CSV separados por familia.
- `carga productos.xlsx` y exportaciones temporales de productos; requieren determinar origen y fecha antes de usarse.

### Precios

- Lista Penosil 2025-2026.
- Resinplast Mayorista 2026.
- Resinplast CF 2026.
- Lista de Baldes abril 2026.
- Tabla PRFV agosto 2026.
- Shopify como referencia comercial, no como autoridad única.

### Imágenes y contenido

- Carpeta `Marketplace/Productos_Lote_50`.
- Carpeta `Catalogo WhatsApp Penosil`.
- URLs e imágenes ya registradas en la semilla auditada.

### Conocimiento técnico

- Fichas técnicas locales de Grupo Poliplast.
- Carpeta Penosil con catálogo y fichas iniciales.
- Inventario técnico con vista previa construido en el commit `a6cca90`.

## Qué falta para tener el inventario maestro real

1. Elegir cuál versión del Catálogo Maestro es la vigente y archivar las anteriores como antecedente.
2. Extraer el universo completo de productos y variantes, no solamente los publicados o candidatos de WhatsApp.
3. Comparar ese universo con Shopify y clasificar: coincidente, falta en Shopify, solo en Shopify o conflicto.
4. Normalizar familia, subfamilia, producto base, variante, SKU y unidad de venta.
5. Separar precio, stock, descripción, imagen y ficha técnica: tienen fuentes y vigencias diferentes.
6. Incorporar Carrozados, EPP y cualquier otra familia ausente.
7. Resolver los SKU conflictivos antes de permitir importación.

## División de trabajo vigente

- **Felipe:** valida decisiones comerciales, precios, SKU dudosos y familias.
- **Codex:** audita y normaliza catálogo/precios; mantiene la arquitectura y las pruebas del cotizador.
- **Claude Code:** persiste y construye la gobernanza de documentos técnicos en Supabase.
- **Claude Chat:** mantiene el manual comercial, consistencia documental y transferencia de conocimiento.

## Próximo entregable de Codex

Una matriz maestra de conciliación con una fila por variante y estas columnas mínimas:

`variant_id`, `sku`, `marca`, `familia`, `subfamilia`, `producto_base`, `variante`, `unidad`, `estado`, `fuente_identidad`, `precio`, `moneda`, `iva`, `lista`, `vigencia`, `fuente_precio`, `imagen`, `ficha_tecnica`, `estado_validacion`, `conflicto`, `decision_felipe`.

Primero se genera como auditoría y vista previa. No se carga automáticamente al CRM, al cotizador, a Shopify ni a Supabase.
