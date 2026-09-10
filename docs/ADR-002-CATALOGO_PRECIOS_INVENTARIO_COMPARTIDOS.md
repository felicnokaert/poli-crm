# ADR-002: Catálogo, precios e inventario compartidos con administración por roles

**Estado:** Aceptado  
**Fecha:** 10/09/2026  
**Decisor:** Felipe

## Contexto

El cotizador debe permitir mantener productos, costos, rentabilidad, listas y stock sin editar código. También existe una aplicación de conteo físico que trabaja por SKU y depósito, pero actualmente conserva un catálogo propio y datos en un almacén genérico. Conectarlos sin una capa común duplicaría identidades y podría mostrar stock o precios divergentes.

## Decisión

Crear una capa operativa compartida en Supabase, gobernada por organización y rol:

- el Catálogo Maestro v12 gobierna identidad y taxonomía inicial;
- una variante canónica tiene un identificador estable y un SKU único normalizado;
- costos, listas de precios, documentos y saldos de inventario son entidades separadas con su propia fuente y vigencia;
- cotizador e inventario consumen esas mismas entidades;
- toda administración masiva pasa por lotes con vista previa, validación, auditoría y reversión;
- costo y rentabilidad quedan restringidos a roles autorizados;
- el conteo físico no se presenta como stock disponible hasta contemplar aprobación, movimientos y reservas.

## Opciones consideradas

### A. Mantener archivos y aplicaciones independientes

**Ventajas:** menor trabajo inicial.  
**Desventajas:** doble catálogo, precios divergentes, conciliaciones manuales y errores por SKU.

### B. Hacer que el cotizador lea directamente el almacén actual del contador

**Ventajas:** integración rápida.  
**Desventajas:** hereda el catálogo duplicado, el PIN local y el almacenamiento genérico; confunde conteo con disponibilidad.

### C. Capa compartida gobernada — elegida

**Ventajas:** una identidad por SKU, seguridad real, historial, importación masiva y evolución hacia Contabilium.  
**Desventajas:** exige migración, mapeo y validación antes de conectar producción.

## Contrato mínimo entre aplicaciones

Cada consulta de inventario debe devolver, como mínimo:

- `variant_id` y `sku`;
- `location_id` y depósito;
- cantidad contada/aprobada;
- unidad de medida;
- fecha de corte;
- estado de aprobación;
- fuente o sesión de conteo.

Cada precio debe devolver, como mínimo:

- `variant_id`;
- lista y escala;
- moneda, IVA y unidad;
- valor y vigencia;
- fuente y estado;
- revisión utilizada.

## Consecuencias

- La aplicación de inventario puede conservar su experiencia móvil, pero debe dejar de poseer otra identidad de producto.
- El cotizador puede mostrar stock fechado sin depender todavía de Contabilium.
- Los archivos CSV/XLSX funcionan como entrada/salida, no como base viva paralela.
- Una carga masiva errónea puede auditarse y revertirse.
- Los vendedores no reciben acceso implícito a costos por poder cotizar.

## Acciones

1. Diseñar la migración aditiva y RLS de catálogo, precios, importaciones e inventario.
2. Definir las plantillas CSV/XLSX por tipo de importación.
3. Implementar el motor puro de vista previa y validación.
4. Mapear el catálogo del contador contra las variantes canónicas y reportar diferencias.
5. Migrar autenticación y cerrar el acceso genérico antes de producción.
6. Integrar primero stock aprobado y fechado; incorporar reservas/movimientos después.
