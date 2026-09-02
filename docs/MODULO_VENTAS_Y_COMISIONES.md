# Módulo Ventas y comisiones

## Objetivo

Registrar las ventas efectivamente realizadas por Felipe, calcular su comisión mensual y permitir control, filtros y exportación sin depender de fórmulas manuales dispersas.

La hoja `Ventas 2026` queda como respaldo durante la transición. El CRM pasa a ser la fuente operativa cuando la importación y los totales hayan sido conciliados durante al menos un mes.

## Reglas confirmadas

- Poliocho: comisión del 1% sobre el total facturado sin IVA.
- Poliplast: comisión del 3% sobre el total facturado sin IVA.
- Documento: Factura o COT.
- Facturas Poliocho: punto de venta/serie `0003`.
- Facturas Poliplast/PURMAC: series permitidas `0006`, `0011`, `0013` y `0016`.
- El usuario ingresa los últimos dígitos y el CRM presenta el número completo con ceros a la izquierda, siguiendo el formato existente (por ejemplo `0003-00001584`).
- La comisión se recalcula automáticamente si cambia la unidad o el importe.

## Campos mínimos

- Fecha de venta.
- Unidad: Poliocho o Poliplast.
- Cliente (vinculado a la cartera cuando exista; texto libre si todavía no existe).
- Tipo de documento: Factura o COT.
- Serie/punto de venta.
- Número de documento.
- Moneda.
- Tipo de cambio, cuando corresponda.
- Importe neto sin IVA en moneda de origen.
- Total neto sin IVA en pesos.
- Porcentaje de comisión (automático, visible y auditable).
- Comisión calculada.
- Vendedor/usuario que registró la venta.
- Familia y producto opcionales.
- Observaciones y estado de control.

## Pantallas

1. **Mis ventas**: tabla compacta por mes con búsqueda y filtros por unidad, cliente, familia, documento y estado.
2. **Registrar venta**: formulario corto; propone serie y porcentaje según la unidad.
3. **Resumen mensual**: neto vendido, comisión total, desglose Poliocho/Poliplast y cantidad de operaciones.
4. **Importar/Exportar**: CSV compatible con la hoja actual, con vista previa, validación y deduplicación por unidad + tipo + serie + número.

## Relación con el CRM

- Una venta puede vincularse a un cliente y a un negocio ganado, pero no es obligatorio.
- Registrar una venta no crea automáticamente una tarea.
- Puede sugerir recompra según familia o frecuencia, siempre como ayuda memoria, no como tarea masiva.
- Los permisos se limitan por usuario corporativo; cada vendedor ve sus resultados y los responsables autorizados pueden ver el consolidado.

## Validaciones

- No permitir porcentajes distintos de 1%/3% salvo una excepción explícita y auditada.
- Advertir números de documento duplicados, sin borrarlos automáticamente.
- Factura exige serie válida; COT puede usar su numeración correspondiente.
- Importe y comisión nunca se guardan como texto formateado.
- Conservar fecha, usuario creador y última edición.

## Implementación por etapas

1. Modelo de datos, cálculo y pruebas automáticas.
2. Registro manual y resumen mensual.
3. Importación CSV de `Ventas 2026` con vista previa.
4. Conciliación de un mes contra la hoja.
5. Roles, consolidado de equipo y exportación contable.

