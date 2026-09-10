# ADR-001: Cotizador como aplicación compañera separada

**Estado:** Aceptado  
**Fecha:** 10/09/2026  
**Decisor:** Felipe

## Contexto

El CRM ya está en uso real y todavía tiene trabajo de estabilización, identidad única y adopción. El futuro cotizador necesita una navegación de catálogo amplia, variantes, reglas de precio, documentos técnicos y PDFs con marca. Incluir todo ahora dentro del CRM aumentaría su tamaño, riesgo y carga cognitiva.

Al mismo tiempo, construir un sistema totalmente aislado duplicaría catálogo, fichas, clientes y reglas comerciales.

## Decisión

Construir el catálogo/cotizador inicialmente como una aplicación interna separada, con interfaz y despliegue propios, pero con:

- modelo de datos compatible;
- identificadores estables de producto, variante, cliente y cotización;
- catálogo técnico y comercial compartido en Supabase;
- RLS por organización y rol, no por número de WhatsApp;
- API o servicio de integración preparado para vincularlo después con el CRM.

La primera versión puede capturar los datos del cliente dentro de la cotización. Cuando el producto sea estable, el CRM podrá abrir el cotizador con el cliente preseleccionado y recibir de vuelta el PDF, total, estado y líneas cotizadas.

## Opciones consideradas

### A. Incluirlo ahora dentro del CRM

**Ventajas:** navegación única y vínculo inmediato con clientes.  
**Desventajas:** mayor riesgo sobre la herramienta operativa, interfaz más pesada y prioridades mezcladas.

### B. Aplicación totalmente independiente y datos duplicados

**Ventajas:** arranque rápido.  
**Desventajas:** precios y fichas divergentes, doble mantenimiento e integración futura costosa.

### C. Aplicación compañera con datos gobernados compartidos — elegida

**Ventajas:** aísla el riesgo de interfaz sin duplicar la fuente de verdad; permite validar el cotizador antes de integrarlo.  
**Desventajas:** requiere definir permisos y contrato de integración desde el comienzo.

## Consecuencias

- El CRM continúa enfocado en clientes, conversaciones, tareas y ventas.
- El cotizador se enfoca en catálogo, variantes, precios, fichas y documentos.
- Supabase almacena la información operativa compartida; los archivos originales siguen en Drive.
- No se copiarán fichas por General/Penosil/Juan.
- La integración CRM-cotizador se difiere, pero no se improvisa: queda prevista mediante IDs y API.

## Próximas acciones

1. Definir tablas y RLS del inventario técnico compartido.
2. Crear migración aditiva y pruebas sin alterar tablas actuales.
3. Construir la UI de vista previa/validación de documentos.
4. Auditar y normalizar el Catálogo Maestro completo.
5. Crear el proyecto/despliegue separado del cotizador cuando el modelo de catálogo esté validado.
