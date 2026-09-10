# Manual práctico de Poliplast Sales Copilot

**Versión:** 1.1  
**Fecha:** 10/09/2026  
**Aplicación:** <https://poli-crm.vercel.app>  
**Audiencia:** Felipe y equipo comercial de Grupo Poliplast  
**Estado:** revisión pedagógica de Claude y validación técnica QA de Codex aplicadas. Las 12 etapas coinciden con el sistema y con `SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`. PDF de revisión generado; pendiente la lectura rápida de Felipe (sección 21) antes de publicar la versión aprobada en Drive.

## 1. Para qué sirve

Poliplast Sales Copilot centraliza la operación comercial cotidiana:

- empresas, personas, teléfonos y correos;
- mensajes que requieren revisión;
- historial comercial;
- compromisos y seguimientos;
- cuentas activas y etapas del método comercial;
- ventas, objetivos y comisiones;
- conocimiento para diagnosticar, responder objeciones y vender mejor.

El CRM **no reemplaza Trello**. Trello organiza proyectos generales, responsables y fechas. Tampoco reemplaza Drive: Drive conserva los documentos oficiales. El CRM administra clientes y la actividad comercial.

## 2. Regla rápida: dónde registrar cada cosa

| Necesidad | Lugar correcto |
|---|---|
| Revisar un mensaje nuevo | CRM → Por revisar |
| Consultar conversaciones anteriores | CRM → Historial |
| Modificar empresa, persona o teléfono | CRM → Empresas |
| Ver todas las personas y números | CRM → Contactos |
| Recordar una llamada o cotización acordada | CRM → Tareas |
| Registrar el estado de una cuenta activa | CRM → Cuentas activas / ficha de empresa |
| Registrar factura, COT, objetivo o comisión | CRM → Ventas |
| Consultar método, objeciones o playbooks | CRM → Academia comercial |
| Gestionar Marketplace, Shopify, ML, catálogo o un proyecto del CRM | Tablero / Trello |
| Consultar manuales y reportes oficiales | Drive Grupo Poliplast |

**No crear una tarjeta de Trello por cada cliente.** Los clientes y sus próximos pasos viven en el CRM.

## 3. Rutina diaria recomendada

### Al comenzar

1. Abrir **Inicio**.
2. Revisar **Plan de hoy**.
3. Resolver primero seguimientos vencidos, calientes sin responder y cotizaciones frías relevantes.
4. Entrar en **Por revisar** y clasificar únicamente los mensajes nuevos que requieren una decisión.

### Durante la jornada

1. Abrir la ficha de la empresa antes de contactar.
2. Verificar persona, teléfono, familia, etapa y contexto previo.
3. Usar la sugerencia del copiloto como ayuda, no como verdad automática.
4. Registrar el resultado factual de la conversación.
5. Crear una tarea solamente si quedó un compromiso o próximo paso concreto.
6. Registrar la venta cuando exista Factura o COT.

### Al cerrar

1. Confirmar que no quedaron mensajes urgentes sin clasificar.
2. Completar o reprogramar compromisos reales.
3. Verificar que las ventas del día estén registradas.
4. Actualizar Trello solo si cambió el estado de un proyecto general.

## 4. Inicio

Es el resumen operativo. Incluye:

- contactos y actividad semanal;
- propuestas y seguimientos;
- **Plan de hoy**;
- próximas acciones;
- últimas conversaciones;
- radar de recompra;
- cotizaciones frías;
- conversaciones comerciales urgentes sin responder.

Los radares son ayudas para decidir. No crean automáticamente una obligación de contactar a todas las personas.

## 5. Por revisar

Muestra entradas nuevas de WhatsApp que todavía necesitan una decisión humana.

### Acciones principales

- **Revisar conversación:** abre el formulario de clasificación.
- **No requiere acción / Solo contexto:** conserva información sin generar seguimiento innecesario.
- **No es cliente:** permite clasificar Equipo interno, Familiar/personal, Proveedor/colaborador u Otro no comercial.
- **Archivar:** quita la conversación del trabajo diario sin eliminarla.
- **Eliminar del CRM:** descarta ese registro. Las eliminaciones poseen persistencia para que la sincronización no lo restaure.
- **Selección masiva:** aplica acciones a varios contactos visibles.

### Cómo clasificar bien

Registrar solamente lo que la conversación demuestra. Si no se conoce un dato, dejarlo como **Sin definir** o **A confirmar**.

La clasificación no comercial se guarda sobre la persona exacta. Otra persona de la misma empresa puede seguir siendo comercial. Si hubo un error, se puede restaurar el contacto al flujo comercial.

### Canales vigentes

- **WhatsApp General:** operativo; no modificar su configuración salvo una falla comprobada.
- **WhatsApp Penosil:** diferido por decisión de Felipe.
- **WhatsApp Juan:** diferido por decisión de Felipe.

## 6. Historial

Presenta una fila por identidad comercial y permite consultar lo registrado anteriormente.

- Buscar por cliente o contenido.
- Filtrar por familia y temperatura.
- Filtrar por rango de fechas.
- Abrir una conversación o la ficha asociada.

Dos empresas diferentes no deben fusionarse solamente porque tengan nombres parecidos. Los registros antiguos se vinculan por nombre únicamente cuando la coincidencia es inequívoca.

## 7. Tareas

Las tareas representan compromisos comerciales concretos, no todos los contactos posibles.

Crear una tarea cuando exista:

- llamada o reunión acordada;
- cotización pendiente;
- información prometida;
- urgencia real;
- fecha probable de recompra;
- seguimiento expresamente definido.

No crear tareas masivas para toda la cartera “por las dudas”. Al marcar una tarea como completada, el cambio debe mantenerse después de recargar.

## 8. Cuentas activas y las 12 etapas

La temperatura y la etapa pertenecen a la empresa comercial, no a cada número de teléfono.

Las 12 etapas del método son: Preparación, Apertura, Diagnóstico, Calificación, Recomendación, Objeción, Propuesta, Seguimiento, Negociación, Cierre, Posventa y Recompra. El detalle de qué significa cada una y cuándo pasar a la siguiente está en `SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`, sección 5 — esa es la fuente para aprender el método; acá solo se usa.

El resultado de una cuenta cerrada (ganada o perdida) no es una etapa aparte: se registra por separado, en el campo de resultado de la ficha, sin mover la cuenta a una etapa "Cierre ganado" o "Cierre perdido" que no existe en el sistema.

Mover la etapa cuando exista evidencia suficiente. No avanzar una cuenta para que “se vea mejor” el tablero.

## 9. Empresas

Es la ficha comercial principal. Una empresa puede tener varias personas, teléfonos y correos.

### Datos que conviene completar

- razón social y nombre comercial;
- CUIT, cuando esté disponible;
- familia o interés principal;
- etapa y temperatura;
- origen y tipo de relación;
- contactos, cargos, teléfonos y correos;
- problema, aplicación, volumen y urgencia;
- proveedor actual, objeción y decisor;
- notas verificables y próximo paso.

### Varios números para una empresa

Agregar cada persona o teléfono en la misma ficha y elegir un contacto principal. No crear una empresa nueva por cada número.

### Posibles duplicados

El CRM detecta señales de coincidencia, pero no fusiona automáticamente por nombre. La futura fusión/deshacer está diferida. Hasta entonces, revisar y editar con prudencia.

### Triage comercial

Las seis variables valen de 0 a 2:

- Relevancia.
- Exposición.
- Problema.
- Urgencia.
- Ticket.
- Actividad.

El total va de 0 a 12. El sistema puede sugerir valores respaldados por la conversación; el vendedor confirma o corrige. Los datos desconocidos no deben inflar la prioridad.

## 10. Contactos

Es una vista transversal de personas y números. Sirve para encontrar rápidamente:

- quién trabaja en cada empresa;
- cargo o área;
- teléfono y correo;
- contacto principal;
- clasificación comercial o no comercial.

La empresa es la unidad comercial; el contacto es la persona con quien se conversa.

## 11. Ventas y comisiones

Permite cargar ventas manualmente o revisar datos extraídos de Facturas/COT antes de guardarlos.

### Reglas actuales

- Ingresar importe neto sin IVA.
- Poliplast: comisión configurada del 3%.
- Poliocho: comisión configurada del 1%.
- Facturas en USD requieren el tipo de cambio correspondiente.
- Impuesto interno y flete/envío no forman parte de la base comisionable cuando están identificados.
- El sistema detecta comprobantes repetidos por unidad, tipo, punto de venta y número.

### Puntos de venta conocidos

- Poliplast/PURMAC: 0006, 0011, 0013 y 0016.
- Poliocho: 0003.

El módulo sigue **en validación** hasta conciliar por lo menos un mes completo con la planilla de ventas utilizada como respaldo.

### Objetivos

Pueden expresarse por cantidad, neto o comisión y filtrarse por unidad, punto de venta o familia. Cuando un objetivo en USD incluye ventas en pesos, completar el tipo de cambio de referencia.

## 12. Memoria de precios y recompra

La memoria toma precios de ventas cargadas y prioriza el precio unitario más reciente. No reemplaza una lista de precios oficial ni garantiza stock.

El radar de recompra necesita historial suficiente: por lo menos dos compras comparables del mismo producto. Su resultado es una sugerencia para revisar, no una orden automática de contacto.

## 13. Academia comercial

Es el lugar para aprender y consultar antes o durante una conversación.

- **Método:** 12 etapas y E-C-E-R-A.
- **Objeciones:** biblioteca única y buscable.
- **Perfiles:** 10 segmentos/playbooks.
- **Biblioteca y práctica:** respuestas rápidas editables.
- **Evaluar conversaciones:** entrenador y rúbrica comercial.

### E-C-E-R-A

1. Escuchar.
2. Confirmar.
3. Explorar.
4. Responder.
5. Acordar.

Las sugerencias nunca responden automáticamente por el vendedor. Precios, stock, rendimiento y compatibilidad requieren una fuente verificable.

## 14. Tablero / Trello

El botón abre el tablero maestro **VENTAS — Grupo Poliplast** y muestra la guía común.

- **00 — Norte y métricas:** objetivos, reglas e índice general.
- **Prioridad semanal:** pocas prioridades reales.
- **En ejecución:** alguien está trabajando actualmente.
- **Esperando cliente/equipo:** depende de una respuesta externa.
- **Bloqueado:** existe un impedimento real.
- **Revisión:** el resultado necesita validación.
- **Terminado esta semana:** trabajo validado y cerrado.
- **Backlog:** trabajos futuros sin competir con la semana actual.

El antiguo Kanban interno quedó preservado en los datos, pero ya no se presenta como fuente operativa porque no estaba sincronizado con Trello.

## 15. Mercado Libre

El módulo corresponde a la integración oficial de lectura de POLIPLAST y FOAM. Su código y controles de seguridad están construidos. No debe considerarse operativo hasta confirmar autorización real y primera sincronización con paridad de datos.

Las publicaciones y decisiones comerciales de Mercado Libre se administran como proyecto en Trello; los datos del canal se consultan en su módulo cuando esté validado.

## 16. Datos, importaciones y respaldos

### Exportar contactos CSV

Genera una copia editable y compatible con Excel. Usarla para análisis o respaldo, no para mantener otro CRM paralelo.

### Importar clientes CSV

El importador reconoce encabezados habituales y prioriza CUIT para detectar identidad. También admite varias personas de PUR Comercial dentro de una empresa. Si un teléfono aparece en empresas distintas, lo informa en vez de fusionarlas silenciosamente.

Antes de una importación grande:

1. exportar respaldo;
2. probar con una muestra pequeña;
3. revisar coincidencias y campos;
4. confirmar que una segunda importación no duplique;
5. recién después ampliar el lote.

### Respaldo integral

Conserva el estado completo del workspace. Guardar una copia antes de limpiezas o importaciones importantes.

### Datos de prueba

La limpieza automática debe limitarse a fixtures inequívocos. Nunca borrar clientes reales o ambiguos como si fueran pruebas.

## 17. Perfil, usuarios y seguridad

- Cada persona accede con su correo corporativo y contraseña.
- No compartir contraseñas, tokens ni claves por chat o documentos.
- Los canales y permisos se aíslan por usuario.
- Los cambios comerciales se sincronizan con el workspace compartido.
- Cambiar la contraseña desde Perfil cuando corresponda.

## 18. Problemas frecuentes

### “Marqué algo y volvió después de recargar”

Verificar primero que aparezca **Sincronizado**. Repetir el caso una vez y registrar exactamente qué entidad volvió. Las correcciones de persistencia ya cubren tareas, eliminaciones y clasificaciones; un caso nuevo debe tratarse como regresión específica.

### “Veo dos empresas parecidas”

No borrar ni fusionar por intuición. Comparar CUIT, teléfonos, personas y origen. Editar solamente cuando la identidad esté confirmada.

### “No aparece un mensaje de Penosil o Juan”

Esos canales están diferidos. No diagnosticarlos como falla actual ni reinstalar extensiones. WhatsApp General es el canal operativo.

### “El copiloto propone algo raro”

No copiarlo automáticamente. Corregir los campos de la empresa, conservar la conversación real y registrar el caso para que Claude valide las reglas con evidencia.

### “Trello y el CRM muestran tareas diferentes”

Es esperable si son tareas de naturaleza distinta. Proyecto general: Trello. Compromiso con un cliente: Tareas del CRM.

## 19. Qué todavía no debe darse por terminado

- QA manual completo en producción.
- Revisión de calidad de los 1.052 registros importados.
- Fusión y deshacer de duplicados.
- Conciliación de Ventas/Comisiones contra un mes real.
- Validación real de Mercado Libre.
- Canales Penosil y Juan, diferidos.
- Validación del copiloto y triage con casos de Cohorte 1.

## 20. Gobierno y actualización del manual

- Codex mantiene esta primera versión técnica hasta el 18/09/2026.
- Claude realiza la revisión pedagógica, la alinea con el Sistema Comercial y continúa su mantenimiento después del 18/09.
- Felipe valida que los pasos coincidan con su uso real.
- Los cambios aprobados se publican en Drive.
- Este manual explica **cómo usar el CRM**. `SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md` explica **cómo vende Grupo Poliplast**. No deben duplicarse ni competir.

## 21. Validación rápida para Felipe

El manual queda aprobado cuando Felipe puede resolver sin ayuda estas acciones:

1. encontrar una empresa y agregarle otro teléfono;
2. clasificar un mensaje y corregir una clasificación equivocada;
3. encontrar una conversación anterior por fecha;
4. crear y completar un seguimiento que persista al recargar;
5. registrar una venta o importar una factura para revisión;
6. encontrar una objeción y su criterio E-C-E-R-A;
7. abrir el Trello maestro desde el CRM y ubicar la prioridad semanal;
8. **(10/09/2026, Claude)** editar un objetivo de ventas ya creado (cambiar el tipo de cambio, por ejemplo) sin que se duplique ni se pierda el progreso acumulado;
9. **(10/09/2026, Claude)** filtrar Historial por familia y temperatura, y pasar a la página siguiente con "Mostrar más" cuando hay más de 20 conversaciones;
10. **(10/09/2026, Claude)** en Recursos → Base técnica, elegir una carpeta de Drive completa, revisar la vista previa (nuevos/modificados/duplicados exactos/posibles duplicados/errores), corregir la familia sugerida de un documento y guardar;
11. **(10/09/2026, Claude)** en Base técnica, cambiar el estado de un documento (inventariado → pendiente de validación → vigente) y confirmar que la base bloquea marcarlo "vigente" sin fuente/responsable/fecha;
12. **(10/09/2026, Claude)** abrir una conversación real en Por revisar y confirmar que el panel "Sugerencia del copiloto" recomienda una ficha técnica que existe de verdad en Base técnica (no una lista vieja desconectada).
13. **(10/09/2026, Claude)** en Base técnica, renombrar una ficha y ver que las fichas quedan agrupadas por carpeta, igual que en Drive.
14. **(10/09/2026, Claude)** eliminar un cliente y confirmar que sus conversaciones también desaparecen de Historial; eliminar una conversación suelta o una tarea sin tener que borrar todo el cliente.

### Registro de avances (Claude, sesión 10/09/2026)

- Bug de "Por revisar" resucitando chats ya eliminados: corregido un gap real en la suscripción en tiempo real que no respetaba `dismissedInboxEventIds` (commit `cf7071c`). No se pudo confirmar si era la única causa — pendiente que Felipe reporte el próximo caso con el nombre del contacto.
- Botón "Guardar" de Base técnica que se desactivaba sin avisar: corregido (commit `d7ca7f2`).
- Base técnica completa de punta a punta: importador con vista previa real (carpeta o archivos sueltos, familia editable por documento), persistencia en Supabase (`technical_documents` + `technical_document_history`, RLS por rol, solo Felipe puede marcar "vigente"), y pantalla de validación en Recursos → Base técnica (commits `9260f6b`, `a6cca90`, `41f01e0`, `d7ca7f2`).
- Carga masiva real ejecutada: 68 fichas técnicas reales de Drive cargadas como "inventariado" (65 nuevas + 3 versiones alternativas de documentos que ya tenían un duplicado exacto). 10 duplicados exactos detectados y no re-importados (mismo archivo en dos carpetas de Drive — limpieza de Drive queda pendiente, no bloquea nada).
- Panel de sugerencia del copiloto conectado al catálogo real de Supabase en vez del índice estático de 31 documentos (commit `1456db8`).
- Migración de Catálogo/Precios/Inventario para el futuro Cotizador (`catalog_products`, `catalog_variants`, costos, listas de precios, inventario, auditoría de importaciones) aplicada en producción — este bloque es de Codex, no del CRM; Claude solo ejecutó la migración ya escrita porque requería acceso a la base compartida.
- Objetivos de Ventas ahora se pueden editar sin duplicar (commit `d05b764`); envío/flete excluido de la comisión (commit `41d73bf`); Imperpur y otras unidades nuevas ya reconocen su punto de venta en la importación de facturas (commit `584c83a`).
- Base técnica: fichas ahora se pueden renombrar y quedan agrupadas por carpeta (como en Drive), sin agregar ninguna tabla nueva — la carpeta se calcula de la ruta que ya se guardaba (commit `70e5b79` es posterior; esta parte específica sin commit propio en el registro, ver historial de `technical-documents-mapping.mjs`).
- Bug reportado por Felipe: al eliminar un cliente, "seguía apareciendo en Historial". Causa real: se borraban la ficha y las tareas, pero no las conversaciones vinculadas. Corregido (commit `d32c7f9`).
- Todos los botones "Eliminar" del CRM se veían cuadrados y sin forma (nunca tuvieron estilo, solo color de texto). Corregido con un estilo compartido — misma píldora redondeada que el resto de los botones, con un rojo suave para distinguirlos (commit `d32c7f9`).
- Auditoría del mismo tipo de bug en el resto del CRM: encontrado que no existía forma de eliminar una conversación o una tarea de forma individual (solo se borraban en cascada al borrar el cliente entero). Agregado el botón y la función de borrado para ambos casos (commit `70e5b79`).
