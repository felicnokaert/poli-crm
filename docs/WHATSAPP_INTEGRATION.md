# Integración de WhatsApp en tiempo real

## Decisión

La carga manual no es el flujo principal. El producto usará WhatsApp Business Platform / Cloud API con coexistencia para que Felipe continúe usando las aplicaciones `POLIPLAST` y `FOAM`, mientras el CRM recibe eventos mediante webhooks.

## Canales

| Perfil | Número | Canal lógico |
|---|---|---|
| POLIPLAST | +54 9 11 5262-7555 | general |
| FOAM | +54 9 11 7155-8957 | penosil |

Los `phone_number_id` de Meta se agregarán como secretos de entorno después del onboarding.

## Estado Meta verificado por capturas — 28/08/2026

| Cuenta | WABA ID | Número | Estado cuenta | Estado número | Calidad | Negocio |
|---|---|---|---|---|---|---|
| Grupo Poliplast | 1620643669067135 | +54 9 11 5262-7555 | Restricted por verificación pendiente | Conectado | Alta | No verificado |
| Penosil Distribuidor Oficial | 2497921480672168 | +54 9 11 7155-8957 | Aprobada | Sin conexión | Sin dato | No verificado |

La restricción observada en Grupo Poliplast indica explícitamente que debe verificarse el negocio antes de enviar mensajes; no se observó una infracción de calidad. Pendientes: ambos `Phone Number ID`, App ID, permisos de Felipe y disponibilidad efectiva de coexistencia.

## Relevamiento ampliado de Claude — 28/08/2026

- Portfolio: `Agente Portfolio`, ID `1411373260640662`.
- Nombre legal cargado actualmente: `IA Agente` — tratar como incorrecto/placeholder hasta confirmación documental.
- Persona con acceso total: Juan Lucarelli.
- Felipe: no asignado al Portfolio, WABAs ni app.
- App existente: `Agente Poliplast`, App ID `857121580457426`.
- Activos conectados a la app: ninguno observado.
- Phone Number ID Penosil: `1336065402914038`.
- Phone Number ID Grupo Poliplast: pendiente.
- WABA Grupo Poliplast: restringida solo por verificación de negocio pendiente; número conectado y calidad alta.
- WABA Penosil: aprobada; número sin conexión.
- Centro de seguridad: negocio sin verificar y un usuario sin passkey/2FA completo.

### Bloqueo de gobernanza

No iniciar la verificación mientras el nombre legal sea `IA Agente` y Felipe no tenga acceso administrativo. Primero debe confirmarse qué razón social será titular del Portfolio, corregirse la información legal con respaldo documental y asignarse a Felipe el acceso correspondiente. No mover ni eliminar WABAs durante esta corrección.

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
