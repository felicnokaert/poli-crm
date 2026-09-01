# Arquitectura funcional — Poliplast Sales Copilot

## Objetivo

Crear una fuente única de verdad comercial que convierta conversaciones en contexto, oportunidades, acciones y aprendizaje sin responder automáticamente ni exigir doble carga al vendedor.

## Flujo

```text
WhatsApp General / Penosil
          ↓
evento de conversación confiable
          ↓
intención + cliente + contexto
          ↓
oportunidad con productos y cantidades
          ↓
próxima acción / tarea / forecast
          ↓
resultado real y aprendizaje
          ↓
recompra, riesgo y recomendación futura
```

## Entidades

- **Cliente:** identidad, contacto, segmento, responsable, memoria y estado de relación.
- **Conversación:** evento contextual vinculado al cliente, intención y necesidad.
- **Oportunidad:** negocio potencial con etapa, probabilidad, fecha, productos y resultado.
- **Producto:** referencia de catálogo con SKU, familia, variante y estado de validación.
- **Tarea:** acción concreta, fecha, disparador y vínculo con cliente u oportunidad.
- **Evaluación:** corrección humana, resultado y aprendizaje reutilizable.
- **Compra:** será el registro confirmado de la operación; luego podrá sincronizarse en lectura con Contabilium.

## Fuentes y autoridad

- Conversaciones: Meta oficial cuando esté disponible; puente local solo sobre chats individuales abiertos.
- Productos: Catálogo Maestro vigente. La exportación auditada local se usa como semilla provisional.
- Precio y stock: nunca se infieren del catálogo descriptivo; requieren fuente comercial vigente.
- Empresas objetivo: Base Comercial separada del catálogo de productos.
- Compras: inicialmente carga/importación; luego Contabilium en modo lectura.

## Reglas de confiabilidad

- Una conversación nunca crea una venta confirmada por sí sola.
- La IA propone intención y próximo paso; el vendedor corrige.
- Los productos “requiere revisión” muestran advertencia.
- Los productos “sin stock confirmado” no se pueden seleccionar como disponibles.
- Toda oportunidad perdida o pausada conserva motivo.
- Toda tarea de oportunidad explica etapa y probabilidad.

## Escalabilidad

La siguiente evolución de datos debe mover oportunidades y permisos a tablas normalizadas de Supabase, manteniendo compatibilidad con el estado compartido actual. Antes de abrir el sistema a múltiples equipos se necesitan roles, responsable por cuenta, auditoría de cambios y separación por organización.
