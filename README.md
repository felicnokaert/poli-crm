# Poliplast Sales Copilot

CRM y copiloto comercial independiente para Grupo Poliplast.

## Propósito

Registrar clientes, conversaciones y próximos pasos; ayudar a Felipe a conducir mejores conversaciones; generar memoria comercial, recordatorios y aprendizaje; conectar la actividad diaria con el Plan Comercial.

## Canales iniciales

- WhatsApp General: +54 9 11 5262-7555
- WhatsApp Penosil: +54 9 11 7155-8957
- Operador inicial: Felipe

## Mapeo de perfiles de navegador

- Perfil `POLIPLAST` → WhatsApp General (+54 9 11 5262-7555).
- Perfil `FOAM` → WhatsApp Penosil (+54 9 11 7155-8957).

Este mapeo fue confirmado explícitamente por Felipe. Los perfiles conservan esos nombres porque también se utilizarán para operar los frentes Poliplast y FOAM. Antes de leer u operar un canal se validará el perfil y el número; no se inferirá la cuenta solamente por foto o contenido.

## Límites del MVP

- No responde mensajes automáticamente.
- No modifica WhatsApp.
- No depende de extensiones no oficiales.
- No almacena contraseñas, tarjetas ni datos bancarios.
- No reemplaza todavía la Base Comercial: la consume como fuente inicial de empresas objetivo.

## Módulos

1. Clientes y contactos.
2. Conversaciones e interacciones.
3. Tareas y recordatorios.
4. Pipeline de oportunidades.
5. Respuestas rápidas por canal.
6. Evaluación y coaching de conversaciones.
7. Panel diario, semanal, mensual y trimestral.
8. Bandeja de autorización para mensajes capturados por el webhook.

## Estado

- Arquitectura y flujo: completos.
- Núcleo local: clientes, conversaciones, tareas y pipeline completos.
- Modelo Claude integrado: 14 criterios, 11 campos de clasificación, 24 respuestas rápidas y 5 role-plays.
- Bandeja WhatsApp lista: permite ignorar, guardar como memoria, crear seguimiento o autorizar entrenamiento sin responder automáticamente.
- Verificación empresarial de Meta: aprobada el 28/08/2026; ambas WABA figuran aprobadas.
- Próximo hito: activar base online y autenticación, desplegar y probar ambos canales.

La evaluación del MVP es guiada: Felipe/Codex puntúan y registran la devolución. La generación automática con IA se incorporará después de validar el flujo y definir la arquitectura online.
