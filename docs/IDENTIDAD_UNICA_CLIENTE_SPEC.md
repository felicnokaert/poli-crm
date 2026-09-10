# Especificación: Identidad única del cliente

**Estado:** En implementación parcial (ver "Estado de implementación" abajo). Diseño original sin tocar código; los pasos ya ejecutados por Codex están documentados y verificados.
**Autor:** Claude (Cowork), a pedido de Marketing / equipo Grupo Poliplast.
**Fecha:** 09/09/2026. Actualizado 10/09/2026 (estado de implementación + decisiones de Felipe).
**Prioridad:** Bloque #1 del orden de implementación CRM (ver manual, Sección 19.1).
**Para:** Codex (implementación), Felipe (decisiones comerciales pendientes).

---

## Estado de implementación (actualizado 10/09/2026)

- ✅ **Hecho (commit `f09313e`):** desactivada `consolidateDuplicateClients` (fusión automática por nombre en cada sincronización, descripta como riesgo #1 en la Sección 1). Se verificó contra duplicados reales de producción (Carrocería Argentina, Ferref Refrigeración, Metalúrgica Bonano) sin fusionar, eliminar ni migrar nada existente. Prueba agregada para impedir que se reactive sin querer. 160 pruebas + compilación completa pasando.
- ✅ **Hecho (commit `e2e77f7`):** construido el detector de posibles duplicados de la Sección 3.4/4 (solo lectura, no persiste todavía como bandeja): evalúa CUIT, teléfono, email, razón social y nombre comercial; cada candidato explica su señal; nombre coincidente solo queda en confianza baja; ninguna confianza fusiona sola. 165 pruebas + compilación pasando.
- ✅ **Hecho (commit `2b31da0`):** pantalla de solo lectura "Posibles duplicados" dentro de Empresas, con nivel de confianza, señales y comparación básica de las dos fichas. No fusiona ni modifica datos.
- ✅ **Hecho (commit `adaa155`):** detector indexado para carteras grandes. Se eliminó el cálculo cuadrático que trababa Empresas; prueba de rendimiento con 2.001 clientes incorporada.
- ✅ **Hecho (commit `c84cdcb`):** una empresa puede administrar varias personas y medios de contacto, elegir el principal, editarlo o quitarlo sin eliminar la empresa. Los campos históricos permanecen sincronizados con el contacto principal.
- ⏸️ **Diferido por Felipe (10/09/2026):** acciones No son duplicados / Postergar y fusión reversible con comparación completa, `mergeLog` y deshacer. No bloquea el comienzo de Academia comercial.
- 🔜 **Pendiente del bloque de identidad:** clasificación no comercial persistente a nivel de persona (Sección 6) y QA con casos reales de varias personas/teléfonos.
- **Preguntas de la Sección 8/Anexo:** ya respondidas por Felipe — ver "Decisiones de Felipe" más abajo, que reemplaza el Anexo original.

---

## 0. Por qué este documento existe

El CRM hoy mezcla tres conceptos que deberían ser independientes: **con quién hablamos** (un teléfono, un contacto), **quién es el cliente** (una empresa o persona con identidad comercial propia) y **por dónde nos escribió** (General, Penosil, Juan). Esto genera fichas duplicadas, pérdide de historial cuando alguien escribe desde Penosil y ya existía en General, y fusiones automáticas de clientes basadas únicamente en que el nombre de empresa coincide como string.

Este documento define el modelo de datos, las reglas de detección de duplicados, el flujo de fusión/deshacer, los casos límite y el plan de migración — sin tocar todavía una sola línea de código. Es la base para que Codex implemente el bloque "identidad única" que Felipe marcó como prioridad #1.

---

## 1. Hallazgo crítico: el CRM ya fusiona automáticamente, y eso hay que revisar antes de sumar nada nuevo

Al leer el código actual (`src/workspace.mjs`) se confirma que existe una función `consolidateDuplicateClients` que:

- Agrupa todos los clientes por `normalizedCompany(client.company)` (nombre de empresa limpiado: minúsculas, sin tildes, sin símbolos).
- Cuando dos o más clientes comparten ese nombre normalizado, los **fusiona automáticamente y en silencio**, eligiendo como "canónico" el registro con el timestamp más reciente.
- Reescribe `clientId` en interacciones, tareas y oportunidades para apuntar al registro sobreviviente.
- Esto corre **dentro de `mergeWorkspaceState`**, es decir, **en cada sincronización de estado**, no como una acción puntual que alguien dispara.

Esto es exactamente lo que la Regla 7 y la Regla 9 de este documento prohíben (nunca fusión automática irreversible; el nombre parecido nunca alcanza por sí solo). Es un hallazgo real, no teórico: cualquier empresa que tenga dos fichas con el mismo nombre de empresa hoy ya se fusionó sola, sin revisión humana y sin registro de quién lo autorizó.

**Esto no se toca en este documento.** Queda documentado como el riesgo #1 de migración (ver Sección 8) y como el primer punto que Codex debe resolver, porque cualquier diseño nuevo de identidad conviviendo con esa función activa seguiría fusionando mal.

Un dato a favor: la reconciliación de **hilos de WhatsApp** (`src/whatsapp-threads.mjs`, función `isCrossChannelMirror`) ya usa un criterio bastante más cuidadoso — exige texto idéntico, ventana de tiempo corta y evidencia de que un lado es una captura scrapeada — antes de considerar que dos hilos son el mismo. Ese es el estándar de evidencia que este documento extiende al nivel de cliente/empresa, y el que `consolidateDuplicateClients` no cumple.

También existe una agrupación por nombre en `src/conversation-history.mjs` (`groupConversationHistory`), pero esa es solo una vista de "conversación combinada" para mostrar en pantalla — no reescribe datos ni fusiona registros. No es el mismo riesgo que `consolidateDuplicateClients`, pero comparte la misma debilidad de fondo (agrupar por nombre de empresa normalizado sin más evidencia), así que su lógica de agrupación también debería alimentarse del mismo motor de identidad una vez que exista.

---

## 2. Conceptos: cinco cosas que hoy están mezcladas

| Concepto | Qué es | Ejemplo | Campo actual más cercano |
|---|---|---|---|
| **Empresa** | La identidad comercial: a quién le vendemos, a quién facturamos, quién tiene historial de compra. | "Herrería El Progreso" | `company`, `legalName`, `cuit` |
| **Persona-contacto** | Un individuo con el que hablamos. Puede representar a una empresa, a varias, o a ninguna (particular). | "Marcos, el que atiende el teléfono de Herrería El Progreso" | `contacts[]` (ya existe como array) |
| **Medio de contacto** | Un teléfono, un email, un WhatsApp ID concreto de una persona. | +54 9 11 xxxx-xxxx | `phone`, `email`, `whatsappId` dentro de cada contacto |
| **Canal** | La cuenta de WhatsApp por la que entró el mensaje (General, Penosil, Juan). Es un filtro de bandeja, **no** una identidad de cliente (confirmado en `src/user-channels.mjs`: son cuentas de login con visibilidad distinta sobre el mismo negocio). | Penosil | `event.channel`, `phone_number_id` |
| **Conversación / Interacción** | Un hilo de mensajes o un contacto registrado en una fecha, con su canal y su medio de origen. | La conversación de WhatsApp del 03/09 por Penosil | `interactions[]`, `whatsapp_events` |
| **Estado comercial** | Familia, temperatura, etapa, prioridad, sourceType (cliente activo / prospecto / no corresponde). Pertenece a la **empresa**, no al canal ni al medio. | "Cliente activo, familia Espuma PU, temperatura Caliente" | `family`, `temperature`, `stage`, `sourceType` en el registro de cliente |

La regla de oro de este documento: **el estado comercial vive en un solo lugar — la Empresa (o la Persona, cuando no hay empresa) — nunca se duplica por canal.** Si Juan habla con un cliente por WhatsApp Juan y Felipe habla con el mismo cliente por General, es una sola ficha con dos conversaciones registradas, no dos fichas.

---

## 3. Modelo de datos propuesto

No se propone reemplazar los campos existentes sino reordenarlos y agregar lo que falta. Los campos ya vigentes en `client-contacts.mjs` (`company`, `legalName`, `cuit`, `contacts[]` con `id/name/role/phone/email/whatsappId/source/primary`) se mantienen como base.

### 3.1 Entidad `Cliente` (hoy "client" en el CRM)

Se mantiene como está, pero se aclara su rol: es la **identidad comercial**. Contiene el estado comercial (family, temperature, stage, sourceType, priority) y **no** contiene teléfonos sueltos como fuente de verdad — esos viven en `contacts[]`.

Campos nuevos sugeridos:

- `clasificacionNoComercial`: `{ categoria: 'Equipo interno' | 'Familiar/personal' | 'Proveedor/colaborador' | 'Otro no comercial', clasificadoPor, clasificadoEn, reactivadoPor?, reactivadoEn? }` — hoy esto vive solo a nivel de evento de inbox (`excludedCategory`), no a nivel de cliente. Ver Sección 6.
- `mergeLog[]`: historial de fusiones que afectaron a este registro (ver 3.4).
- `orgId` (o `tenantId`): reservado para el futuro multiempresa (ver Sección 9). Puede quedar con un valor fijo ("poliplast") por ahora, pero el campo debe existir desde el día uno para no migrar de nuevo después.

### 3.2 Entidad `Contacto` (ya existe como `contacts[]` dentro de cliente, se propone poder existir también sin empresa)

Hoy un contacto vive necesariamente colgado de un cliente. Se propone permitir un contacto "huérfano" (persona sin empresa asignada todavía, o particular que nunca va a tener una): esto cubre el caso de alguien que escribe y todavía no sabemos si es cliente, o de una persona que compra por su cuenta sin representar ninguna empresa.

Campos (extienden lo ya existente):
- `id`, `name`, `role`, `phones[]` (hoy es un solo `phone` por contacto — se propone permitir varios medios verificados para la misma persona, ej. celular personal + línea de la empresa), `email`, `whatsappId`, `source`, `primary`.
- `empresaId`: nullable. Si es null, el contacto es independiente.
- `empresasHistoricas[]`: lista de empresas con las que este contacto trabajó o trabaja, con fecha de vínculo — cubre el requisito de que una persona puede cambiar de empresa o trabajar con varias sin que el sistema lo asuma automáticamente (Sección 5).

### 3.3 Entidad `Interacción` (ya existe)

Se mantiene, pero se refuerza que **siempre** debe guardar:
- `canalOrigen` (General/Penosil/Juan/futuro).
- `medioOrigen` (el teléfono o email concreto usado).
- `contactoId` (la persona).
- `clienteId` (la empresa a la que se atribuye, puede ser distinto de la empresa "actual" del contacto si en ese momento hablaba a nombre de otra).

Esto ya está parcialmente cubierto (`whatsapp-threads.mjs` guarda `channel`, `customer_wa_id`, etc.), pero no hay garantía hoy de que la interacción quede atada al `clienteId` correcto cuando un contacto tiene más de una empresa histórica. Es responsabilidad de este rediseño, no una reescritura de lo ya guardado.

### 3.4 Entidad nueva: `Bandeja de posibles duplicados` (revisión)

Registro separado (no se mezcla con la ficha de cliente) con:
- `id`, `tipo` ('empresa' | 'contacto'), `candidatoA`, `candidatoB` (o lista, si son más de dos), `señales[]` (qué coincidió: teléfono exacto, CUIT exacto, email exacto, nombre similar, etc.), `confianza` ('alta' | 'media' | 'baja'), `estado` ('pendiente' | 'fusionado' | 'descartado'), `sugeridoEn`, `resueltoPor?`, `resueltoEn?`.

Esto formaliza y reemplaza en la práctica a `duplicatePhoneSignals` (que hoy detecta colisiones de teléfono entre clientes pero no persiste el hallazgo en ningún lado ni ofrece acción) — se propone que ese detector siga siendo la base del cálculo, pero que su resultado se guarde como fila en esta bandeja en vez de calcularse al vuelo y descartarse.

### 3.5 Registro de fusión (`mergeLog`)

Cada fusión ejecutada (nunca automática, ver Sección 5) genera un registro:
```
{
  id, fecha, ejecutadoPor,
  clienteSobrevivienteId, clientesFusionadosIds: [...],
  snapshotAntes: { ... },  // copia completa de los registros antes de fusionar
  camposConflicto: [...],  // campos donde había datos distintos y se eligió uno
  deshecho: boolean, deshechoPor?, deshechoEn?
}
```
El `snapshotAntes` es lo que permite deshacer sin reconstruir desde cero. Se guarda completo (no solo un diff) porque el volumen de clientes es chico y la seguridad de poder deshacer vale más que el espacio.

---

## 4. Reglas de detección de duplicados

Señales, de más a menos confiables. Ninguna señal por sí sola dispara una fusión automática — todas alimentan la bandeja de revisión (Sección 3.4). Solo la combinación de **dos señales fuertes coincidentes** puede proponerse como "confianza alta" en la bandeja, pero incluso así requiere confirmación humana antes de fusionar.

1. **CUIT idéntico** (normalizado: solo dígitos) → señal fuerte.
2. **Teléfono idéntico** (usando `normalizePhone`, ya existente: descarta no-dígitos, quita "00" inicial, se queda con los últimos 10 dígitos) → señal fuerte, pero recordar que un teléfono puede ser compartido por varias personas de la misma empresa (una línea de conmutador) — por eso teléfono idéntico identifica coincidencia de **contacto**, no automáticamente de empresa.
3. **Email idéntico** (normalizado en minúsculas) → señal fuerte para contacto; media para empresa (los emails corporativos genéricos tipo `ventas@` se comparten).
4. **Razón social idéntica** (CUIT ausente, pero razón social normalizada igual) → señal fuerte.
5. **Nombre de empresa idéntico normalizado** (lo que hoy usa `consolidateDuplicateClients`) → señal **media**, nunca alta por sí sola. Nombres comerciales cortos ("Poliplast Sur", "Poliplast Norte") pueden coincidir después de normalizar sin ser la misma empresa.
6. **Nombre de contacto + rol similares** (lo que hoy usa `sameContact`) → señal media.
7. **Coincidencia difusa / aproximada** (distancia de edición baja entre nombres, ej. "Herreria El Progreso" vs "Herrería el Progreso SRL") → señal **baja**, solo sirve para que la bandeja la sugiera, nunca para autocompletar una fusión.

**Regla explícita pedida por el equipo:** similitud de nombre, sola, nunca fusiona automáticamente, sin importar qué tan alta sea la confianza calculada. Confianza "alta" en este sistema solo describe qué tan arriba aparece en la lista de revisión, no una autorización para actuar sin humano.

---

## 5. Flujo de fusión y deshacer

1. El sistema calcula señales (en background o al guardar/importar) y agrega/actualiza filas en la Bandeja de posibles duplicados. Nunca modifica los registros originales en este paso.
2. Un usuario humano (hoy: Felipe; mañana: cualquier usuario con permiso) abre la bandeja, ve los candidatos ordenados por confianza, y para cada uno puede: **Fusionar**, **Marcar como no duplicado** (para que no vuelva a aparecer esa combinación), o **Postergar**.
3. Al fusionar, el sistema pide elegir cuál de los registros es el "sobreviviente" cuando hay conflicto de datos (ej. dos temperaturas distintas) — nunca se decide solo. Guarda el `mergeLog` con el snapshot completo antes de tocar nada.
4. La fusión une: todos los teléfonos/contactos, todas las conversaciones/interacciones, todas las oportunidades/ventas/tareas/notas, conservando el origen (canal+medio) de cada interacción histórica intacto.
5. **Deshacer:** disponible mientras exista el `mergeLog` correspondiente (no hay límite de tiempo propuesto, aunque se puede definir uno más adelante). Restaura los registros desde `snapshotAntes` y marca el log como `deshecho`.
6. Caso "una persona trabaja con varias empresas": nunca se asume automáticamente. Si un contacto aparece escribiendo a nombre de una empresa distinta a la que tiene asignada como principal, el sistema lo señala como "contacto visto en otra empresa" (no lo reasigna, no lo fusiona) y dentro de la ficha de la persona se acumula en `empresasHistoricas[]`. La decisión de si es la misma persona cambiando de trabajo, la misma persona con dos changas, o dos personas con el mismo nombre, es siempre humana.

### 5.1 Pantalla de comparación antes de fusionar (detalle agregado 10/09/2026 — para cuando se construya este bloque, no es el próximo a implementar)

Antes de ejecutar el paso 3, la pantalla de fusión debe mostrar explícitamente:

- Qué empresa se conserva (el registro elegido como sobreviviente).
- Qué teléfonos y personas se incorporan (los contactos que llegan desde el registro fusionado).
- Qué historial y tareas se trasladan (interacciones, oportunidades, ventas, notas).
- Qué valores están en conflicto (los campos donde los dos registros tenían datos distintos, para que la elección del paso 3 sea explícita y no implícita).
- Posibilidad de deshacer la unión, visible en la misma pantalla de confirmación, no solo disponible después buscándola.

Este detalle no cambia el diseño de la Sección 3.5 (`mergeLog`) ni del resto de esta sección — es la especificación de la interfaz que muestra esos mismos datos antes de confirmar. Queda documentado para cuando Codex llegue a este bloque (ver orden en `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md`, Sección 5); no es parte del bloque que se está construyendo ahora (la bandeja de revisión sin fusión, Sección 3.4).

---

## 6. Clasificaciones no comerciales (Equipo interno / Familiar / Proveedor / Otro)

Ya existe una implementación parcial: en la bandeja de WhatsApp (`src/App.jsx`), cada contacto puede marcarse con `excludedCategory` ("Equipo interno", "Familiar / personal", "Proveedor / colaborador", "Otro no comercial"), lo que cambia su `classification_status` a `excluded` y lo saca de la vista operativa de "Por revisar". Por separado, a nivel de cliente/empresa existe `sourceType` con un valor "No corresponde" que cumple una función parecida en la cartera.

Lo que falta y este documento pide:

- **Persistencia real y sin reaparición:** una vez clasificado como no comercial, el contacto no debe volver a la bandeja "Por revisar" aunque escriba de nuevo con el mismo saludo genérico, **salvo que el mensaje nuevo tenga contenido claramente comercial** (menciona producto, precio, cantidad, pedido) — en ese caso el sistema debe **alertar** ("Este contacto está marcado como Equipo interno, pero este mensaje parece una consulta comercial — ¿reclasificar?") en vez de decidir solo.
- **Reclasificación manual siempre disponible:** Felipe (o quien tenga permiso) puede revertir la clasificación no comercial en cualquier momento, quedando registrado quién y cuándo.
- **Unificar el criterio a nivel de Empresa/Persona, no solo de evento de inbox:** hoy la exclusión vive por evento de WhatsApp; se propone que la clasificación no comercial viva en la ficha de la Persona-contacto (y, si corresponde, en la Empresa), para que aplique a todos los canales por los que esa persona escriba, no solo al canal donde se marcó la primera vez. Esto es consistente con el hallazgo ya documentado en el propio código (`isIgnoredWhatsAppContact`, comentario: "una regla de 'no comercial' marcada en un canal no viajaba al otro" — ya fue parcialmente resuelto para el cruce de canales por nombre, pero conviene resolverlo definitivamente a nivel de identidad de contacto una vez que exista).

---

## 7. Casos límite (con ejemplos anonimizados reales del sistema actual)

1. **Un contacto, dos nombres distintos según el canal.** El mismo número de WhatsApp puede llegar como "Juan Herrería" desde una bandeja y como "Juan (011-xxxx)" desde otra, porque una de las bandejas históricamente scrapeaba el nombre visible y la otra usa el `wa_id`. Señal correcta: teléfono normalizado, no nombre. (Ya identificado en el código: `whatsapp-threads.mjs` comenta explícitamente este problema para Penosil scrapeado vs General por webhook.)
2. **Una empresa, varios teléfonos.** Una herrería o taller puede tener un celular del dueño, una línea fija de oficina y un WhatsApp del encargado de compras — los tres deben quedar bajo la misma empresa como contactos distintos, nunca fusionarse entre sí como si fueran la misma persona solo por pertenecer a la misma empresa.
3. **El mismo contacto en General y en Penosil.** Puede ser exactamente la misma persona preguntando por dos líneas de producto distintas (poliuretano de Poliplast y espuma proyectable de Penosil) — es una persona, posiblemente vinculada a la misma empresa, con dos conversaciones de canal distinto que deben verse unificadas en su historial pero sin mezclar el `sourceType`/temperatura que cada unidad de negocio le asigna si son evaluaciones comerciales distintas (a definir con Felipe, ver Sección 8, pregunta 3).
4. **Nombre de empresa ambiguo.** Dos clientes reales distintos llamados "Distribuidora del Sur" en dos provincias distintas — el nombre normalizado coincide, el CUIT y el teléfono no. Este es el caso que `consolidateDuplicateClients` fusiona mal hoy.
5. **Contacto marcado "Familiar/personal" que después hace una consulta real de compra.** Ej.: la pareja de un vendedor de Foam Factory que un día pregunta por precio de espuma para uso propio — debe alertar para reclasificar, no ignorar ni auto-convertir.

---

## 8. Riesgos de migración

1. **`consolidateDuplicateClients` ya fusionó datos en producción, en silencio, sin log.** No hay forma de saber hoy cuántas fusiones "malas" (nombre igual, empresa distinta) ya ocurrieron, porque la función no dejaba rastro. La migración debe empezar con un **diagnóstico**, no con una corrección directa: correr un análisis de solo lectura sobre los datos actuales para listar qué clientes comparten nombre normalizado, cruzarlo con CUIT/teléfono para estimar cuántas fusiones pasadas fueron probablemente correctas vs. probablemente erróneas, y mostrarle ese diagnóstico a Felipe antes de tocar nada. No se puede asumir que los datos actuales están limpios.
2. **No hay snapshot histórico de fusiones pasadas**, así que deshacer una fusión que ya ocurrió (antes de este sistema) no será posible automáticamente — en esos casos, la reconstrucción tendría que ser manual si Felipe identifica un caso concreto.
3. **Los teléfonos hoy están modelados como un campo por contacto (`contacts[].phone`), no como una lista.** Pasar a "varios medios verificados por persona" (Sección 3.2) es un cambio de forma de datos, no solo de reglas — requiere una migración de esquema, aunque de bajo riesgo porque es aditiva (se puede convertir `phone` en el primer elemento de `phones[]` sin perder nada).
4. **Doble fuente de verdad para "no comercial"** (evento de inbox vs. cliente): unificarlo implica decidir qué pasa con exclusiones ya cargadas solo a nivel de evento — probablemente haya que migrarlas a nivel de contacto la primera vez que se detecte el mismo `whatsappId`/teléfono en el nuevo modelo.
5. **Volumen y prioridad de revisión manual.** Si el diagnóstico inicial arroja muchos candidatos a duplicado, cargarle a Felipe una bandeja de cientos de decisiones el primer día es poco realista. Se recomienda que la primera carga de la bandeja se filtre a "confianza alta" (CUIT o teléfono exacto) y que el resto quede disponible pero no se empuje como tarea urgente.

---

## 9. Multiusuario y multiempresa (preparación, no implementación)

Este diseño no implementa multi-tenant, pero está pensado para no tener que rehacerse cuando llegue (`PRODUCT_ROADMAP.md`, "Puerta 2 — Plataforma multiempresa"):

- Toda entidad nueva (`Bandeja de posibles duplicados`, `mergeLog`) incluye `orgId` desde el diseño, aunque hoy tenga un solo valor posible.
- Las reglas de fusión y clasificación no comercial son por organización — un contacto marcado "Proveedor" en Grupo Poliplast no debería, en un futuro multiempresa, heredar esa clasificación a otra organización que use el mismo software.
- Los permisos de quién puede fusionar/deshacer/reclasificar deben apoyarse en el modelo de roles ya previsto en el roadmap (admin/supervisor/vendedor), no inventarse aparte.

---

## 10. Criterios de "hecho" (verificables)

1. Existe una función de detección de duplicados que corre sobre los datos reales y genera candidatos con señal y nivel de confianza, sin modificar ningún registro.
2. Existe una pantalla/bandeja donde un usuario ve esos candidatos y puede Fusionar / Descartar / Postergar — ninguna fusión ocurre sin esa acción explícita.
3. Toda fusión genera un `mergeLog` con snapshot previo, y existe una acción de "Deshacer" que restaura el estado anterior verificablemente (se puede probar: fusionar dos clientes de prueba, deshacer, y confirmar que ambos vuelven con todos sus datos e historial intactos).
4. `consolidateDuplicateClients` ya no se ejecuta automáticamente en cada sincronización — o fue reemplazada por el flujo de bandeja, o quedó explícitamente desactivada con un comentario que explique por qué.
5. Un contacto marcado como no comercial no reaparece en "Por revisar" tras un mensaje genérico nuevo, pero sí genera una alerta (visible, no bloqueante) cuando el mensaje nuevo tiene contenido comercial explícito.
6. Un teléfono nuevo asociado a una empresa ya existente (mismo CUIT o razón social) no crea una ficha de empresa duplicada — pero tampoco fusiona un contacto nuevo en la empresa sin que sea claramente el mismo canal de contacto ya conocido u ofrecido como sugerencia.
7. Existe al menos un caso de prueba documentado y verificado para cada uno de los 5 casos límite de la Sección 7.
8. El diagnóstico inicial de migración (Sección 8, punto 1) fue generado, mostrado a Felipe, y las fusiones históricas de alto riesgo fueron señaladas explícitamente (no corregidas automáticamente).
9. Los nuevos campos (`orgId`, `mergeLog`, `phones[]`, `clasificacionNoComercial`) existen en el esquema con datos migrados de forma aditiva (nada del modelo actual se pierde).

---

## Anexo: decisiones de Felipe (10/09/2026, reemplaza las preguntas abiertas)

1. **Historial unificado, temperatura única.** El cliente se clasifica una sola vez. Intereses, productos y conversaciones se conservan separados por unidad de negocio/canal (General/Penosil/Juan), pero no hay dos temperaturas ni dos etapas independientes para el mismo cliente — esto ajusta la Sección 2 ("el estado comercial vive en un solo lugar") y cierra el caso límite #3 de la Sección 7 sin ambigüedad.
2. **Fusiones administradas por Felipe, inicialmente.** Más adelante podrá habilitarse a supervisores, nunca a cualquier comercial sin criterio — esto fija el primer paso del modelo de permisos de la Sección 9.
3. **Confianza alta = confirmación de un clic.** Después de ver el resumen del candidato (Sección 3.4), un clic alcanza para fusionar cuando no hay conflicto de datos; pedir campo por campo queda reservado para cuando sí lo hay (Sección 5, paso 3).
4. **Fusiones históricas: diagnóstico primero, después prioridad por actividad.** Antes de tocar nada se corre el diagnóstico completo de solo lectura (Sección 8, riesgo 1); resuelto eso, se revisan primero las empresas con más ventas, tareas o actividad — no por orden alfabético ni por antigüedad.
