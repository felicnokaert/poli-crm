# Estado y roadmap del CRM

Actualizado: 28/08/2026.

## Estado real

| Frente | Avance | Estado |
|---|---:|---|
| Definición del producto y arquitectura | 100% | Alcance, canales, límites y flujo definidos. |
| UX/UI del MVP | 90% | Navegación, formulario simplificado, ficha previa a llamada, escritorio y móvil probados. |
| CRM local | 95% | Clientes, conversaciones, tareas, pipeline completo, recompra, respuestas y respaldos funcionando. |
| Bandeja WhatsApp | 85% | Autorización, clasificación, tiempo real y simulador implementados; falta activar infraestructura. |
| Entrenamiento comercial | 65% | Rúbrica, devolución y casos realistas probados; falta análisis automático con IA. |
| Base online y usuarios | 70% | Esquema, RLS, acceso por email y sincronización implementados; falta crear los servicios externos. |
| Integración oficial con Meta | 50% | WABAs/app relevados y webhook implementado; verificación empresarial en revisión. |
| Operación productiva | 45% | Despliegue preparado; faltan activar servicios, monitoreo y piloto con mensajes reales. |

Avance global estimado del MVP: **78%**. No equivale todavía a un CRM productivo conectado: la infraestructura externa aún no fue creada.

## Cómo se sincronizará

1. Los dos números permanecen en sus aplicaciones WhatsApp Business mediante coexistencia oficial.
2. Meta envía cada evento al webhook HTTPS del copiloto.
3. El webhook valida la firma, identifica General/Penosil por `phone_number_id`, normaliza y deduplica.
4. La base online guarda el evento en la bandeja como `pendiente`.
5. Felipe decide: ignorar, memoria, seguimiento o entrenamiento.
6. El CRM crea o actualiza cliente, conversación y tarea según esa decisión.
7. La IA analiza solamente conversaciones autorizadas y propone próximos pasos; nunca responde sola en el MVP.

## Trabajo que no depende de Meta

- Crear base online y autenticación.
- Conectar el frontend con esa base.
- Publicar una versión privada para PC y móvil.
- Ejecutar pruebas end-to-end con eventos simulados firmados.
- Mejorar UX/UI, accesibilidad y estados vacíos.
- Preparar análisis IA con datos ficticios o anonimizados.

## Trabajo que depende de Meta

- Aprobación empresarial.
- Confirmar acceso activo de Felipe y asignación de activos.
- Obtener el `phone_number_id` de Grupo Poliplast.
- Vincular WABAs con la app correcta.
- Completar coexistencia del número Penosil.
- Suscribir el webhook y probar eventos reales de ambos números.

## Reparto Codex / Claude

### Codex

- Producto, arquitectura, código, base, webhook, seguridad y despliegue.
- UX funcional, pruebas y operación del CRM.
- Integración con Meta y fuente comercial canónica.

### Claude

- Revisión experta del lenguaje comercial y de la experiencia de coaching.
- Casos de role-play, preguntas de diagnóstico y criterios por familia.
- Pruebas exploratorias como usuario, usando exclusivamente datos ficticios.
- Entrega de recomendaciones; no modificar código, Meta, CRM ni crear bases paralelas.
