# Integración de WhatsApp en tiempo real

## Decisión

La carga manual no es el flujo principal. El producto usará WhatsApp Business Platform / Cloud API con coexistencia para que Felipe continúe usando las aplicaciones `POLIPLAST` y `FOAM`, mientras el CRM recibe eventos mediante webhooks.

## Canales

| Perfil | Número | Canal lógico |
|---|---|---|
| POLIPLAST | +54 9 11 5262-7555 | general |
| FOAM | +54 9 11 7155-8957 | penosil |

Los `phone_number_id` de Meta se agregarán como secretos de entorno después del onboarding.

## Flujo objetivo

```text
Cliente ↔ WhatsApp Business App ↔ Meta Cloud API
                                      │
                                   webhook
                                      │
                              Bandeja temporal segura
                                      │
                         reglas + análisis + autorización
                                      │
             CRM / tarea / oportunidad / entrenamiento
```

## Autorización

La suscripción oficial recibe eventos de los números conectados. La selección ocurre dentro del CRM:

- `Ignorar`: no crear cliente ni oportunidad; aplicar la retención mínima definida.
- `Solo memoria`: conservar resumen e historial, sin tareas comerciales.
- `Seguimiento`: crear/actualizar cliente, oportunidad y próximas acciones.
- `Entrenamiento`: además permitir evaluación de la conversación.

Por defecto una conversación nueva queda en `Pendiente de clasificar`; el sistema puede sugerir una categoría, pero Felipe confirma.

## Principios

- Ningún envío automático en el MVP.
- La IA propone; Felipe decide y envía.
- No guardar contraseñas, tarjetas, CBU ni documentos personales en el análisis.
- Validar firma de todos los webhooks.
- Deduplicar por ID de mensaje.
- Registrar perfil/número de origen sin inferir por contenido.
- Los mensajes salientes iniciados por la empresa respetarán consentimiento y políticas de Meta.

## Dos caminos de activación

1. **Coexistencia oficial mediante onboarding/partner compatible:** recomendado; mantiene el uso de WhatsApp Business App y habilita webhooks.
2. **Extensión selectiva de navegador:** solo contingencia temporal; es más frágil, depende de la interfaz de WhatsApp Web y no será la fuente canónica.

## Dependencias externas pendientes

- Portfolio comercial de Meta.
- WABA y app de Meta o proveedor/Tech Provider compatible con coexistencia.
- `phone_number_id` de cada canal.
- Access token permanente y app secret, guardados exclusivamente como secretos.
- Dominio HTTPS público para el webhook.
- Base online con autenticación y políticas de acceso.

