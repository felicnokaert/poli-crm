# QA operativo del CRM - 10/09/2026

> **Nota posterior (12/09/2026):** este documento es una foto del 10/09/2026. El punto "Empresas / identidad unica" de la matriz y el pendiente #2 ya no reflejan el estado actual: la fusión manual, "No son duplicados", "Postergar" y "Deshacer" se implementaron el 11-12/09/2026 (ver `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md`, sección "Estado de implementación", y `docs/MANUAL_USO_CRM_POLIPLAST.md`, sección 9). Falta todavía el QA de esa función con casos reales de cartera a gran escala, no la implementación. El resto de la matriz de este documento no se revalidó de nuevo.

## Alcance

Validacion funcional de solo lectura en produccion, complementada con la suite automatizada local. No se guardaron cambios sobre clientes, conversaciones, tareas ni ventas reales durante la prueba.

## Resultado ejecutivo

- Aplicacion disponible, autenticada y sincronizada.
- Navegacion principal operativa.
- Trello funciona como tablero maestro desde `Tablero / Trello`; el tablero interno anterior queda preservado pero fuera de la operacion diaria.
- `Por revisar` muestra entradas nuevas, permite filtrar y separa conversaciones ya respondidas y contactos no comerciales.
- El formulario de clasificacion usa las 12 etapas canonicas del metodo comercial.
- `Fecha proxima` y `Proxima accion` abren vacias; guardar una conversacion sin compromiso ya no crea una tarea automatica.
- Historial, Academia, Ventas y Mercado Libre fueron revisados en modo lectura.
- Suite automatizada: 186/186 pruebas aprobadas y build de produccion correcto.

## Matriz de validacion

| Area | Estado | Evidencia / observacion |
|---|---|---|
| Inicio y sincronizacion | Aprobado | Produccion mostro estado `Conectado` y `Sincronizado`. |
| Por revisar | Aprobado | 9 entradas General al momento de la prueba; filtros de familia y prioridad disponibles. |
| Clasificacion | Aprobado | Se verificaron Preparacion, Apertura, Diagnostico, Calificacion, Recomendacion, Objecion, Propuesta, Seguimiento, Negociacion, Cierre, Posventa y Recompra. |
| Seguimientos explicitos | Aprobado | Fecha y accion vacias por defecto; boton `Guardar conversacion` sin compromiso. La politica esta cubierta por pruebas automatizadas. |
| Contactos no comerciales | Aprobado visual | La seccion persiste fuera de la bandeja diaria y permite recuperacion. No se reclasifico un contacto real durante QA. |
| Historial | Aprobado visual | Formato horario de 24 horas y filtros de fecha presentes. No se modificaron datos. |
| Academia comercial | Aprobado visual | 12 etapas y biblioteca de objeciones disponibles. |
| Tablero / Trello | Aprobado | El acceso abre el tablero maestro de Ventas en Trello. |
| Ventas | Aprobado en lectura | Se visualizaron ventas, objetivos, unidades y comisiones. No se probo alta/edicion con datos reales. |
| Mercado Libre | Bloqueado externamente | POLIPLAST y FOAM figuran pendientes de conectar en produccion; requiere completar autorizacion oficial. |
| Penosil y Juan | Diferido por decision | No forman parte del cierre operativo actual. |
| Empresas / identidad unica | Parcial al 10/09 | El modelo admite empresa y contacto; a esta fecha el flujo de posibles duplicados, fusion manual y deshacer seguia pendiente. **Implementado el 11-12/09/2026** (ver nota al inicio del documento). |
| Persistencia de tareas | Aprobado por codigo/pruebas | La correccion impide nuevas tareas accidentales. Las tareas historicas ya generadas requieren limpieza controlada aparte. |

## Correcciones cerradas durante el QA

1. Se elimino la creacion automatica de seguimientos al clasificar una conversacion sin compromiso concreto.
2. Se unificaron las etapas del CRM con el metodo comercial canonico de 12 etapas.
3. Ganado, Perdido y Pausado quedaron como resultado comercial, no como etapas.
4. Trello quedo como unico tablero maestro de proyectos y trabajo general.

## Pendientes reales

1. Limpiar de manera controlada las tareas historicas generadas automaticamente, sin tocar compromisos reales.
2. ~~Implementar la bandeja de posibles duplicados y la fusion reversible de identidad unica.~~ Implementado el 11-12/09/2026; pendiente el QA con casos reales de cartera a gran escala.
3. Completar y validar la autorizacion oficial de Mercado Libre cuando la plataforma lo permita.
4. Validar altas y ediciones de Ventas con una operacion real acordada por Felipe.
5. Hacer una pasada corta del manual con Felipe y publicar la version aprobada en Drive.

## Criterio de cierre

El nucleo operativo de WhatsApp General y la clasificacion comercial queda apto para uso diario. El CRM no se considera terminado al 100% hasta cerrar identidad unica, limpieza historica controlada, validacion de Ventas e integracion de Mercado Libre.
