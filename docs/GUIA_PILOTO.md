# Guía breve del piloto

## Qué hace la bandeja

Cuando Meta habilite el acceso, cada mensaje recibido por WhatsApp General o Penosil entrará primero en `Bandeja WhatsApp`. El sistema no lo convierte automáticamente en cliente ni responde por Felipe.

## Las cuatro decisiones

- `Ignorar`: no crea cliente, conversación ni tarea.
- `Solo memoria`: conserva el contacto y el mensaje para recordar el contexto, sin crear una tarea.
- `Crear seguimiento`: registra el contacto y crea una tarea para hoy.
- `Entrenamiento`: registra la conversación y autoriza que se evalúe con la rúbrica comercial.

## Antes de conectar Meta

En `Datos` se pueden importar eventos normalizados de prueba. El sistema deduplica por ID del mensaje y omite confirmaciones técnicas de entrega. Hay un ejemplo seguro en `test/fixtures/normalized-events.json`.

## Regla operativa

WhatsApp sigue siendo el lugar donde Felipe conversa. El copiloto es memoria, agenda y entrenador. En el MVP nunca envía respuestas automáticamente.
