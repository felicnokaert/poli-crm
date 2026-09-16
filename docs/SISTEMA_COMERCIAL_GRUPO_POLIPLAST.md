# Sistema Comercial Grupo Poliplast

**Estado:** Manual operativo canónico — v2
**Responsable:** Felipe Cnokaert
**Equipo:** ver sección 4 (Equipo y funciones)
**Última actualización:** 10 de septiembre de 2026
**Cadencia de revisión:** semanal durante la implementación; mensual una vez estabilizado

## 0. Control de versión y changelog

Este documento es la **única fuente operativa** del sistema comercial de Grupo Poliplast. Reemplaza, absorbiendo su contenido, a:

- `DIAGNOSTICO_Y_METODO_COMERCIAL_POLIPLAST.md` (31/08/2026) — diagnóstico comercial y método de 12 etapas.
- `SISTEMA_DE_CALIFICACION_Y_PRIORIZACION.md` (31/08/2026) — 5 criterios de calificación.
- `BIBLIOTECA_DE_CONVERSACIONES_Y_OBJECIONES.md` (31/08/2026) — guiones y matriz de 11 objeciones.
- `PLAYBOOKS_COMERCIALES_POR_SEGMENTO.md` (31/08/2026) — 10 playbooks por segmento.

Esos cuatro documentos quedan como **respaldo histórico** en `docs/historico/` — no se editan más y no se usan como fuente operativa en paralelo a este manual. `RUTINAS_METRICAS_Y_REUNIONES_DE_VENTAS.md`, `PROGRAMA_FORMACION_COMERCIAL_4_SEMANAS.md`, `PLAN_PRIMERA_CAMPANA_COMERCIAL.md` y `MODULO_VENTAS_Y_COMISIONES.md` se conservan como documentos operativos vivos y enlazados, no se fusionan acá porque cubren procesos distintos (formación, campaña puntual, especificación técnica).

### Changelog

| Versión | Fecha | Qué cambió |
|---|---|---|
| v1 | 09/09/2026 | Primera versión canónica (Codex). Definía un proceso propio de 9 macroetapas, un triage de 6 variables y un cuadro de 10 objeciones, sin reconciliar con el método de 12 etapas ya cargado en el CRM ni con los documentos previos de Claude (31/08). Copia conservada en `docs/historico/SISTEMA_COMERCIAL_GRUPO_POLIPLAST_v1_2026-09-09.md`. |
| v2 | 09/09/2026 | Fusiona v1 con el método de 12 etapas (confirmado en producción, `src/opportunities-model.mjs`), el sistema de 5 criterios y el triage de 6 variables en un único triage, la biblioteca de 11 objeciones con las 10 nuevas, y los 10 playbooks por segmento. Corrige "CRM 45% / Meta 65%" (dato histórico del 28/08, retirado), identifica "Fase 6" como ajena al proceso comercial, distingue personas confirmadas de funciones de apoyo, deja el Ejecutivo Comercial como pendiente de confirmación, y agrega la tabla de datos pendientes de validación. Aprobada con condiciones por Marketing el 09/09/2026. |
| v2.1 | 10/09/2026 | Registra el arranque de la implementación del bloque #1 de la sección 19.1 (identidad única del cliente): desactivación de la fusión automática por nombre (`consolidateDuplicateClients`) y construcción del detector de posibles duplicados, ambos sin fusionar ni migrar datos existentes. Incorpora en sección 21 las decisiones de Felipe sobre las 4 preguntas abiertas de `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md`. No cambia método, triage, objeciones ni playbooks. |
| v2.2 | 10/09/2026 | Incorpora la arquitectura aprobada de "CRM como copiloto comercial" (nuevo documento `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md`): tres niveles (ayuda contextual, Academia comercial, aprendizaje con casos reales) que continúan la sección 19.1 después del bloque #1. Ajusta la sección 19.2, cuyos ítems de objeciones/playbooks/casos se absorben en el nuevo documento. No cambia método, triage, objeciones ni playbooks (secciones 5-8). |

---

## 1. Propósito

Este documento convierte la estrategia, el conocimiento técnico, el CRM, la prospección, el contenido y la experiencia del equipo en una única manera de vender.

El objetivo no es que todos hablen igual. El objetivo es que todos:

- identifiquen a quién vale la pena atender;
- escuchen antes de ofrecer;
- diagnostiquen el problema real;
- recomienden la solución adecuada dentro del ecosistema del grupo;
- registren lo mínimo indispensable;
- acuerden un próximo paso concreto;
- aprendan de cada conversación;
- construyan relaciones, recompra, referencias y venta cruzada.

Una persona nueva en el equipo comercial debería poder leer únicamente este documento y saber qué vender, a quién priorizar, cómo diagnosticar, cómo responder objeciones, cómo hacer seguimiento y qué registrar — sin necesitar los documentos históricos de la sección 0.

## 2. Norte comercial

Grupo Poliplast no se presenta como un catálogo de productos aislados. Se presenta como un socio técnico-comercial capaz de acompañar una necesidad desde el diagnóstico hasta la continuidad.

> Diagnosticamos el problema, definimos la solución y podemos integrar insumos, equipamiento, capacitación, aplicación y seguimiento.

La ventaja distintiva es la integración del grupo — y ningún competidor directo (Fischer, Barovo, Suprabond, Kuwait, Adhematic, Crossmaster, Química RyF, Sika, Kubrex/Rhino Linings, Texxor/Noroo, Satch) reúne estas piezas al mismo tiempo:

1. Insumos y formulaciones.
2. Equipamiento PURMAC y repuestos.
3. Aplicación y experiencia de campo (red RAPYP).
4. Fabricación y transformación (Foam Factory).
5. Marcas y soluciones especializadas (Penosil/EasySpray, distribución exclusiva Argentina).
6. Acompañamiento técnico-comercial (Imperpur, N°1 del mercado en aislamiento y revestimientos térmicos).

No todas las oportunidades requieren las seis capacidades. El valor está en poder combinarlas cuando el problema lo exige. Este argumento de integración vertical hoy vive disperso en distintos documentos — este manual lo convierte en discurso repetible (ver sección 8, playbooks).

## 3. Fuentes metodológicas y herramientas prácticas

Cada fuente aporta una herramienta concreta, no una lectura teórica. Se usan como caja de herramientas, no como doctrina.

### Estrategia del Océano Azul — W. Chan Kim y Renée Mauborgne

**Aporte:** innovación en valor, diferenciación y creación de demanda.
**Herramienta práctica — Matriz ERAC (Eliminar/Reducir/Aumentar/Crear):** ver sección 3.1 aplicada a Poliplast. Se revisa trimestralmente en la reunión trimestral (sección 12).
**Aplicación:** dejar de competir solamente por precio o producto y construir una categoría propia alrededor del diagnóstico y la solución integral.

### Joe Girard

**Aporte:** disciplina de contacto, servicio posterior a la venta, confianza, referencias y permanencia en la memoria del cliente.
**Herramienta práctica — "Ley de los 250":** cada cliente conforme influye en su propia red de contacto; el pedido de referencia (sección 9, guion A.13/recompra) se hace solo después de un valor comprobado, nunca antes.
**Aplicación:** ningún cliente valioso termina en la factura; la relación continúa con seguimiento útil, recompra, recomendación y pedido de referencia cuando corresponda.

### Los 7 hábitos de la gente altamente efectiva — Stephen R. Covey

**Aporte:** conducta individual y coordinación del equipo.
**Herramienta práctica — chequeo rápido antes de cada conversación:** ¿actúo sobre la cartera o espero el pedido? ¿tengo un fin en mente antes de escribir? ¿esto es lo primero o solo lo más fácil?
**Aplicación:**

- Ser proactivo: actuar sobre la cartera en lugar de esperar pedidos.
- Empezar con un fin en mente: definir el resultado buscado antes de contactar.
- Primero lo primero: priorizar cuentas de impacto (ver triage, sección 6), no confundir actividad con avance.
- Pensar ganar-ganar: recomendar lo que le conviene al cliente y a la empresa.
- Primero comprender: escuchar y diagnosticar antes de explicar (etapa de Diagnóstico, sección 5).
- Sinergizar: vender como grupo y no como unidades aisladas.
- Afilar la sierra: entrenar, revisar conversaciones y mejorar el método (ver `PROGRAMA_FORMACION_COMERCIAL_4_SEMANAS.md`).

### Robert Kiyosaki

**Aporte útil:** alfabetización financiera, comprensión del flujo de dinero y diferencia entre facturación, margen y generación de caja.
**Herramienta práctica:** antes de cerrar una condición de pago o descuento, preguntarse "¿esto mejora el margen real o solo la facturación?" — cruzar con el módulo de Ventas y Comisiones (sección 11) antes de comprometer condiciones.
**Aplicación limitada:** evaluar la calidad económica de una oportunidad y hablar con el cliente sobre retorno, costo total y riesgo. Sus ideas no reemplazan el análisis contable ni se usan como doctrina de ventas.

### SPIN Selling — Neil Rackham

**Aporte:** preguntas de Situación, Problema, Implicación y Necesidad-beneficio.
**Herramienta práctica — guía de las 4 preguntas para la etapa de Diagnóstico (sección 5, macroetapa 3):**
1. Situación: ¿cómo lo resolvés hoy?
2. Problema: ¿qué no funciona de esa alternativa?
3. Implicación: ¿qué pasa si eso no se resuelve?
4. Necesidad-beneficio: ¿qué resultado considerarías satisfactorio?

**Aplicación:** estructurar el descubrimiento sin convertirlo en interrogatorio.

### Gap Selling — Keenan

**Aporte:** vender el cambio entre la situación actual y la situación deseada.
**Herramienta práctica:** todo diagnóstico (sección 5) se redacta como brecha: situación actual → situación deseada → costo de mantener la brecha. Si no se puede completar esa frase, el diagnóstico no está terminado.
**Aplicación:** el diagnóstico debe explicar qué sucede hoy, qué debería suceder y qué costo tiene mantener la brecha.

### The Challenger Sale — Matthew Dixon y Brent Adamson

**Aporte:** enseñar, adaptar y conducir la conversación.
**Herramienta práctica:** en la etapa de Recomendación (sección 5), aportar al menos un dato o perspectiva que el cliente no había considerado (ej. costo total vs. precio unitario, riesgo de continuidad de stock) antes de presentar el producto.
**Aplicación:** aportar una perspectiva técnica o económica que el cliente no había considerado, sin soberbia ni presión artificial.

### Influence — Robert Cialdini

**Aporte:** principios de persuasión (autoridad, prueba social, reciprocidad, coherencia, escasez, afinidad).
**Herramienta práctica — uso ético permitido:** autoridad (MercadoLíder Platinum, +30 años, Imperpur N°1 del mercado), prueba social (casos y referencias reales), coherencia (recordar compromisos previos del cliente), reciprocidad (asesoramiento técnico genuino antes de pedir la venta). **Nunca:** fabricar escasez, testimonios o urgencia falsa (ver objeción "no es el momento", sección 7).
**Aplicación ética:** usar evidencia, autoridad técnica, coherencia, prueba social y reciprocidad genuina.

### Never Split the Difference — Chris Voss

**Aporte:** escucha táctica, rotulación de emociones, preguntas calibradas y negociación.
**Herramienta práctica:** en Objeciones y Negociación (sección 5, macroetapas 6 y 9), usar preguntas calibradas ("¿qué es lo que te preocupa de esto?") en vez de preguntas cerradas, y rotular la emoción antes de responder ("parece que te preocupa el plazo, no el precio").
**Aplicación:** bajar defensas, comprender restricciones y construir acuerdos; no manipular.

### 3.1 Matriz ERAC de Poliplast (Océano Azul aplicado)

| Eliminar | Reducir | Aumentar | Crear |
|---|---|---|---|
| Mensajes genéricos | Sobrecarga de catálogo en el primer contacto | Diagnóstico | Triage comercial común (sección 6) |
| Discurso fragmentado por razón social | Tareas para contactos sin prioridad | Escucha activa | Arquitectura de solución entre unidades |
| Promesas sin evidencia | Dependencia de conocimiento individual | Evidencia técnica y visual | Contenido protagonizado por personas |
| Venta automática por precio | Seguimientos sin propósito | Velocidad y claridad | Memoria comercial compartida (CRM) |
| Competencia interna entre unidades | Formularios largos | Postventa y recompra | Casos integrales y rutas de implementación |

### 3.2 No clientes a explorar

1. Empresas que compran componentes separados porque desconocen que pueden resolver el sistema completo.
2. Usuarios que evitan ciertos materiales por miedo técnico o falta de capacitación.
3. Fabricantes que tercerizan una solución porque no conocen una ruta gradual para incorporarla.
4. Compradores que eligen exclusivamente por precio porque nadie les mostró costo total, desperdicio, tiempo, falla o retorno.
5. Profesionales, especificadores y aplicadores que no compran hoy, pero influyen sobre la decisión.

## 4. Equipo y funciones

Para evitar inferir cargos que no están confirmados, se distinguen tres categorías. No se declara a nadie como "puesto activo" sin confirmación directa.

**Personas confirmadas (por nombre, con rol comercial directo):**

| Persona | Zona / foco |
|---|---|
| Felipe Cnokaert | Buenos Aires — alcance nacional B2B industrial, producción audiovisual semanal |
| Ezequiel | Mar del Plata — foco Resinplast e Imperpur |
| Brenda | Buenos Aires — canal digital / Mercado Libre / reventa minorista |
| Marketing (interlocutora de este manual) | Community management, gestión de proyecto, agencia interna de marketing para las cuentas de Instagram del grupo |

**Ejecutivo Comercial adicional — pendiente de confirmación.** Documentos previos (31/08) mencionaban nombres de la estructura original de Notion ("Ventas 1: Nahuel", "Ventas 2: Brenda") sin confirmar vigencia. Este manual **no asume que esa persona esté activa**. Queda en la tabla de datos pendientes (sección 16) hasta que Felipe lo confirme.

**Funciones de apoyo (no necesariamente personas contratadas hoy — pueden ser una persona, una tarea compartida, o un agente/asistente de IA):**

| Función | Qué cubre | Estado |
|---|---|---|
| Community Manager (CM) | Calendario editorial, moderación, soporte comercial en redes, escucha social, derivar tráfico a canales de venta | Función activa — ejercida hoy por Marketing con apoyo de Claude/Cowork como asistente |
| Diseñador Gráfico | Piezas gráficas y audiovisuales, repositorio de entregables | Función necesaria — sin persona dedicada confirmada en este manual |
| Analista (Datos + Ads) | KPIs, métricas de redes, Ads Mercado Libre | Función necesaria — hoy cubierta parcialmente por asistentes de IA (Claude/Cowork) y Codex para el frente técnico |
| Planificador | Calendario comercial (Hot Sale, Cyber, Black Friday, lanzamientos) | Función necesaria — sin persona dedicada confirmada en este manual |

Las instrucciones del proyecto listan estas cinco funciones como estructura de referencia del modelo Smarketing; este manual las documenta como **funciones**, no como confirmación de que existan cinco contrataciones distintas. Cuando el RACI (sección 13) asigna una función a "CM" o "Analista", se entiende como el rol, ejercido por quien corresponda hoy (persona o asistente de IA), no como una plaza confirmada.

## 5. Proceso comercial único

El proceso tiene **una sola versión operativa**: las 9 macroetapas de este manual son la explicación ejecutiva del mismo proceso cuyas 12 etapas ya están cargadas y en uso en el CRM (`Oportunidades`, campo `Etapa del método`, confirmado en `src/opportunities-model.mjs`: Preparación, Apertura, Diagnóstico, Calificación, Recomendación, Objeción, Propuesta, Seguimiento, Negociación, Cierre, Posventa, Recompra). El vendedor **registra siempre en las 12 etapas del CRM** — las 9 macroetapas son para explicar y entrenar, nunca un segundo proceso a cargar por separado.

```text
Atracción / prospección
        ↓
Triage (sección 6)
        ↓
Descubrimiento y diagnóstico
        ↓
Arquitectura de solución
        ↓
Propuesta y objeciones
        ↓
Negociación y cierre
        ↓
Implementación y postventa
        ↓
Recompra, venta cruzada y referencias
```

### 5.1 Tabla de equivalencias — macroetapas ↔ etapas del CRM

| Macroetapa (explicación ejecutiva) | Etapa(s) del CRM (`Oportunidades`, registro real) | Qué se hace |
|---|---|---|
| 1. Atracción y prospección | *(previo a alta de Oportunidad)* | Identificar persona/empresa, origen y motivo aparente del contacto. Regla: una consulta todavía no es una oportunidad hasta pasar por el Triage. |
| 2. Triage | *(decide si se abre Oportunidad y con qué prioridad)* | Aplicar el triage único (sección 6). |
| 3. Descubrimiento y diagnóstico | **Preparación → Apertura → Diagnóstico** | Preparar el contacto con contexto real, lograr primera respuesta, entender la necesidad con las 4 preguntas SPIN (sección 3). |
| 4. Calificación | **Calificación** | Decidir si la cuenta merece inversión de tiempo comercial ahora. |
| 5. Arquitectura de solución | **Recomendación** | Presentar producto y, cuando aplique, máquina y/o derivación a RAPYP. |
| 6. Propuesta y objeciones | **Objeción → Propuesta** | Resolver dudas con método E-C-E-R-A (sección 7) y formalizar cotización. |
| 7. Negociación y cierre | **Seguimiento → Negociación → Cierre** | Mantener viva la conversación, cerrar la brecha entre propuesta y necesidad, formalizar el pedido. |
| 8. Implementación y postventa | **Posventa** | Confirmar recepción y uso, detectar inconvenientes. |
| 9. Recompra y venta cruzada | **Recompra** | Anticipar recompra, identificar venta cruzada, pedir referencia solo con valor comprobado. |

**Regla de uso:** el vendedor nunca elige entre "usar las 9 o las 12" — carga siempre la etapa del CRM (columna derecha); las macroetapas son el mapa para entender en qué momento del proceso está y para entrenar a alguien nuevo.

### 5.2 Detalle de cada etapa del CRM

Cada etapa incluye objetivo, preguntas clave, señales, errores frecuentes, criterio para avanzar y qué se registra. Aplicable principalmente a venta B2B técnica (aplicadores, distribuidores, fabricantes); para Mercado Libre, las primeras etapas las resuelve la publicación (ver playbook 10, sección 8) y las etapas de Objeción en adelante siguen aplicando igual.

**Preparación** — Objetivo: llegar al primer contacto con contexto real. Preguntas internas: ¿a qué familia pertenece esta empresa? ¿es prospecto nuevo, cliente dormido, a recuperar, o un competidor que no debe contactarse (ver decisiones ya resueltas en la base comercial)? ¿qué producto tiene mayor probabilidad de encaje? Error frecuente: contactar sin revisar si ya existe una decisión de "no prospectar". Avanza cuando hay un canal de contacto válido y un ángulo de apertura claro.

**Apertura** — Objetivo: lograr una primera respuesta real, no solo enviar el mensaje. Señal positiva: responde en menos de 48-72hs y pregunta algo concreto. Error frecuente: abrir con catálogo genérico en vez de un gancho específico por familia. Avanza cuando el contacto muestra algún nivel de apertura.

**Diagnóstico** — Objetivo: entender la necesidad técnica y comercial real antes de recomendar nada (usar las 4 preguntas SPIN de la sección 3). Señal de riesgo: el contacto solo pide "mandame precios" sin querer conversar sobre el uso — no saltar directo a cotización sin intentar el diagnóstico. Avanza cuando se entiende qué necesita la empresa, en qué volumen y con qué frecuencia.

**Calificación** — Objetivo: decidir si esta cuenta merece inversión de tiempo comercial ahora. Preguntas: ¿el volumen justifica una cotización a medida? ¿quién decide la compra? ¿hay urgencia real o es exploratorio? Avanza a Recomendación si es viable (volumen + decisor + timing); si es viable pero no ahora, pasa a seguimiento espaciado con fecha de retoma.

**Recomendación** — Objetivo: presentar la solución específica apoyada en el diagnóstico, aportando una perspectiva que el cliente no había considerado (Challenger Sale). Error frecuente: recomendar el catálogo completo en vez de 1-2 opciones concretas; no mencionar la integración (máquina + insumo + aplicador RAPYP) cuando aplica. Avanza cuando el contacto acepta o pide cotización formal.

**Objeción** — Objetivo: resolver dudas concretas con el método E-C-E-R-A (sección 7). Se registra la objeción en el campo correspondiente de la Oportunidad — este registro es lo que permite, con el tiempo, detectar patrones por familia.

**Propuesta** — Objetivo: formalizar una cotización clara. Incluye: problema a resolver, recomendación y alcance, supuestos pendientes de validación, evidencia técnica, precio y condiciones cuando estén confirmados, próximo paso con responsable y fecha. Error frecuente: enviar precio sin condición de entrega ni pago claras.

**Seguimiento** — Objetivo: mantener viva la conversación sin ser invasivo. Criterio de reintentos: 3 intentos espaciados en 3 semanas antes de reclasificar (ver dato pendiente de confirmación formal en sección 16). Error frecuente: seguimiento genérico ("¿alguna novedad?") sin referirse a un punto concreto de la propuesta.

**Negociación** — Objetivo: cerrar la brecha entre lo propuesto y lo que la cuenta necesita, sin resignar rentabilidad automáticamente (usar preguntas calibradas de Chris Voss). Error frecuente: ceder en precio sin pedir nada a cambio (volumen, plazo de pago, recurrencia).

**Cierre** — Objetivo: formalizar el pedido. Señal de riesgo: el contacto dice "sí, dale" pero no avanza con pago/orden — puede ser una aceptación blanda. Error frecuente: no coordinar el despacho en el momento del cierre (objetivo interno: despacho <24hs).

**Posventa** — Objetivo: asegurar que el pedido llegue bien y detectar cualquier problema antes de que se convierta en objeción futura. Error frecuente: no hacer seguimiento proactivo y enterarse de un problema solo si el cliente reclama.

**Recompra** — Objetivo: convertir un cliente puntual en cuenta recurrente y ampliar lo que compra (venta cruzada). Se pide referencia (Joe Girard) solo cuando hay valor comprobado. Error frecuente: no tener un calendario de recompra estimado por cliente/familia.

## 6. Triage único

Fusión del triage de 6 variables y el sistema de 5 criterios previos — **un solo puntaje, sin dos sistemas paralelos.** Pensado para completarse en aproximadamente un minuto, mirando datos que ya están o deberían estar cargados en el CRM (`Empresas` + `Gestión comercial`), sin scoring decorativo ni campos nuevos que nadie va a mantener.

### 6.1 Las 6 variables (0, 1 o 2 puntos cada una)

| Variable | Pregunta | Fuente en el CRM | 0 | 1 | 2 |
|---|---|---|---|---|---|
| Relevancia | ¿Encaja con mercados y capacidades del grupo? | Rol asignado en `Empresas` | No / competidor no prospectable | Dudoso | Sí, prospecto o cliente válido |
| Exposición | ¿Qué arriesga o pierde el cliente si no lo resuelve? | Nota de diagnóstico | Baja | Media | Alta |
| Problema | ¿Existe una necesidad concreta? | Nota de diagnóstico | No | Difusa | Clara |
| Urgencia | ¿Hay una señal de apuro real? | Campo "Señal de urgencia" (texto corto, vacío si no hay) | Sin señal | Señal parcial | Señal explícita (ej. "pidió stock para obra de esta semana") |
| Ticket | ¿Cuál es el valor potencial? | Campo "Valor potencial" (Alto/Medio/Bajo) | Bajo | Medio | Alto |
| Actividad | ¿Responde y colabora para avanzar? | Última acción + fecha | No responde | Parcial | Activa |

**Resultado (suma 0 a 12):**

- 9 a 12: **Prioridad A** — avanzar ahora.
- 6 a 8: **Prioridad B** — completar diagnóstico o nutrir.
- 3 a 5: **Prioridad C** — seguimiento liviano.
- 0 a 2: no perseguir activamente.

**Reglas de seguridad:**

- Ticket alto sin relevancia ni problema no es Prioridad A.
- Un reclamo urgente pasa a atención prioritaria aunque no sea una venta.
- Un contacto técnico influyente puede ser estratégico aunque no compre directamente.
- Los datos desconocidos se marcan como desconocidos; no se inventan para elevar el puntaje.
- No se contactan para venta: `competidor`, `proveedor` fuera de gestión de compras, y cualquier empresa marcada como "no prospectar" en la base comercial (esa lista ya está resuelta, no se reevalúa caso por caso).

### 6.2 Orden de la mañana (secuenciación dentro del día — no es un segundo puntaje)

El triage (6.1) decide **si** una cuenta merece tiempo. Este orden decide **a quién llamar primero hoy** entre las cuentas ya calificadas — es una capa de secuenciación, no un puntaje alternativo:

1. Señal de urgencia activa (variable Urgencia = 2), sin importar el resto.
2. Cotizaciones enviadas hace 3+ días sin respuesta.
3. Clientes dormidos con compra recurrente histórica (Ticket Alto/Medio por historial).
4. Clientes a recuperar con último contacto hace 15+ días sin cerrar.
5. Prospectos nuevos de Prioridad A.
6. Prospectos nuevos sin calificar todavía — se les asigna el triage hoy mismo si se los va a contactar, nunca a ciegas.
7. Seguimiento de rutina — llena el resto del día si sobra tiempo.

**Cross-selling — cuándo se activa:** cuando un cliente actual tiene relación con una segunda familia sin compra registrada todavía, se ofrece en el mismo contacto de seguimiento de rutina, no amerita un contacto aparte.

### 6.3 Qué NO hace este sistema (a propósito)

- No exige llenar un formulario largo por empresa — un campo sin dato se trata como "sin señal" y no bloquea la decisión.
- No reemplaza el criterio del Ejecutivo Comercial — una llamada del cliente en el momento siempre gana.
- No es un reporte para Dirección — eso lo cubre `RUTINAS_METRICAS_Y_REUNIONES_DE_VENTAS.md`.

## 7. Biblioteca de objeciones

Fusión de la matriz de 11 objeciones (31/08) con las 10 objeciones del documento del 09/09. Se eliminaron duplicados; cada fila indica de qué documento original viene, para trazabilidad. Es una biblioteca única y ampliable — cuando un guion se prueba con éxito en terreno, se agrega acá.

**Método común para tratar cualquier objeción — E-C-E-R-A:**

1. **Escuchar:** dejar terminar y no defenderse.
2. **Confirmar:** demostrar que se entendió la inquietud.
3. **Explorar:** encontrar la causa real detrás de la frase inicial (preguntas calibradas de Chris Voss).
4. **Responder:** usar evidencia, alternativa o límite honesto.
5. **Acordar:** cerrar con un siguiente paso verificable.

| Objeción | Qué puede significar | Pregunta de exploración | Respuesta a construir | Origen |
|---|---|---|---|---|
| Es caro / precio | No percibe diferencia, compara mal, o no tiene presupuesto | ¿Con qué lo estás comparando y qué incluye? | Costo total, respaldo técnico y de marca (+30 años, MercadoLíder Platinum), riesgo verificados — no bajar precio como primera respuesta | Fusión v1 + B.1 |
| Ya tengo proveedor | Inercia, confianza, o insatisfacción no explicitada | ¿Qué valorás de él y qué mejorarías si pudieras? | Proponer una prueba puntual y acotada, no pedir que "cambie" — nunca criticar al proveedor actual | Fusión v1 + B.2 |
| Mandame información | Interés bajo o necesita compartir con un tercero | ¿Qué decisión querés poder tomar con esa información? | Material corto y específico, no catálogo completo | v1 (nueva) |
| Lo tengo que pensar / consultar | Falta información, confianza, autoridad, o decisión compartida real | ¿Qué parte necesitás evaluar / hay algo puntual que te van a preguntar? | Resolver el punto pendiente y dejar material fácil de compartir; acordar fecha de retoma | Fusión v1 + B.10 |
| No es el momento / falta de urgencia | Prioridad insuficiente, o el proyecto todavía no arrancó | ¿Qué tendría que ocurrir para que pase a ser prioridad? / ¿para cuándo lo estás pensando? | Nutrición con disparador concreto — nunca inventar urgencia falsa | Fusión v1 + B.3 |
| No sé si sirve / rendimiento técnico | Riesgo técnico, mala experiencia previa, o segmento exigente (cámaras frigoríficas, PRFV náutico) | ¿Qué condición de uso te preocupa más? | Derivar a validación técnica — nunca dar un dato de rendimiento de memoria (marcar **[dato técnico — validar con Felipe/ficha técnica]**) | Fusión v1 + B.7 |
| Necesito poco / escala baja | Es una prueba, consumo único, o recurrente chico | ¿Es una prueba, consumo recurrente o uso único? | Presentación adecuada o canal alternativo (ej. derivar a ML/Shopify si aplica) | v1 (nueva) |
| No conozco la marca / desconfianza | Falta de confianza en la marca o en el canal de compra | ¿Qué evidencia necesitás para evaluarla? | Casos, certificaciones, reseñas reales, demostración — apoyarse en autoridad (Platinum, Imperpur N°1) | Fusión v1 + B.4 |
| Lo decide otra persona | Falta el decisor, o el contacto es solo influenciador técnico | ¿Cómo podemos ayudarte a presentárselo correctamente? | Incorporar al decisor sin desplazar al contacto original | Fusión v1 (nueva variante de B.10) |
| Necesito entrega inmediata | Riesgo operativo, fecha límite real | ¿Cuál es la fecha límite real y qué ocurre después? | Confirmar stock real antes de comprometer fecha — nunca prometer disponibilidad sin verificar | Fusión v1 + B.6/B.8 |
| Condiciones de pago | Problema real de liquidez, o solo busca mejor condición | ¿Qué condición te funciona mejor para este pedido? | Ver margen con el equipo; cualquier plazo/financiación se confirma antes de comprometerse **[dato comercial — validar con Felipe]** | B.5 (histórica, sin equivalente en v1) |
| Necesidad de prueba | Quiere validar antes de comprometer un pedido grande — objeción sana | ¿Qué cantidad te serviría para probar sin que sea un compromiso grande? | Armar un pedido chico de prueba con seguimiento posventa agendado | B.9 (histórica, sin equivalente en v1) |
| Silencio después de cotizar | Perdió prioridad, compara en paralelo, o el precio no cerró y no lo dice | ¿Cambió algo de lo que necesitabas, o seguís evaluando? | Aportar algo nuevo en el segundo seguimiento (stock, condición) — nunca repetir el mismo mensaje varias veces | B.11 (histórica, sin equivalente en v1) |

**Nota de coordinación:** la misma objeción pesa distinto según el segmento (ver sección 8) — "precio" en un cliente Penosil mayorista no es lo mismo que en una cámara frigorífica técnica. El criterio de "cuándo pausar" siempre prioriza no quemar la relación a largo plazo por cerrar una venta en el corto plazo.

## 8. Playbooks por segmento

Diez perfiles de cliente, con motivo de compra, objeción típica y próximo paso natural. Contenido íntegro del documento histórico, sin resumir, porque es la referencia que un vendedor nuevo necesita para no adivinar el segmento en cada conversación.

**1. Aplicadores (RAPYP y externos)** — Compran de forma recurrente. Necesitan continuidad de insumo, máquina confiable (PURMAC) y respaldo técnico si algo falla en obra. Motivador: técnico y confianza en partes iguales. Objeción típica: "ya tengo mi proveedor de siempre" / desconfianza sobre soporte técnico. Argumento: insumo + máquina + laboratorio + trayectoria de Imperpur como aplicador original del grupo; invitar a RAPYP si no forma parte. Familias: POLIURETANOS, POLIUREA, PURMAC, EPP. Next step: llamada técnica breve para relevar qué usa hoy, no venta directa.

**2. Fabricantes** — Compran en volumen con recurrencia planificada. Necesitan previsibilidad de suministro (cantidad, calidad, plazo constantes lote a lote). Motivador: técnico primero, plazo segundo, precio se negocia sobre volumen. Objeción típica: garantía de consistencia entre lotes / condiciones de pago para volumen sostenido. Argumento: Foam Factory ya fabrica a escala con consistencia probada; ofrecer prueba de lote antes de volumen recurrente. Familias: POLIURETANOS, RESINPLAST, CARROZADOS. Next step: relevar volumen mensual y especificación, coordinar precio por volumen, enviar muestra con seguimiento a 15-30 días.

**3. Distribuidores y revendedores** — Compran para revender sin transformar. Necesitan margen competitivo y catálogo con rotación probada. Motivador: precio (margen) y confianza en demanda real. Objeción típica: "ya revendo la marca X, ¿por qué cambiar?". Argumento: no pedirle que abandone su proveedor, ofrecer línea complementaria con ventaja probada (PoxiPlast best seller, EasySpray exclusivo). Familias: POLIURETANOS, RESINPLAST, PENOSIL. Next step: propuesta de línea inicial acotada (3-5 productos de mejor rotación).

**4. Constructoras y aislaciones** — Necesitan cumplir un requisito técnico de obra. Motivador: confianza (Imperpur N°1 del mercado — el argumento de autoridad más fuerte del grupo) y técnico. Objeción típica: si el producto cumple la norma/especificación exigida. Argumento: apoyarse en la posición de mercado de Imperpur como prueba social, ofrecer referencias de obras resueltas. Familias: POLIURETANOS, CARROZADOS, PENOSIL. Next step: dimensionar la obra (m², tipo de sustrato), cruzar contra la base de Servicios de Aislación ya relevada.

**5. Cámaras frigoríficas y panelería** — Nicho técnico exigente. Motivador: técnico casi exclusivamente, preguntan especificación antes que precio. Objeción típica: rendimiento bajo condiciones específicas — piden dato duro. Argumento: la seriedad de la derivación técnica es el argumento, nunca improvisar un dato **[dato técnico — validar con Felipe/ficha técnica]**. Familias: POLIURETANOS, CARROZADOS. Next step: derivación técnica inmediata antes de cualquier cotización.

**6. Carrozados** — Usan PRFV, plancha de PU, adheplast, herrajes, burletes, revestimiento térmico. Necesitan consolidar varios insumos en un solo proveedor. Motivador: técnico y plazo. Objeción típica: proveedor actual distinto por cada insumo (compras fragmentadas). Argumento: armar "kit de carrocería" consolidando el pedido; cruzar con RESINPLAST (PRFV) para revestimiento + refuerzo estructural. Familia: CARROZADOS completa. Next step: pedido tipo kit, cruzar contra empresas ya validadas.

**7. PRFV (fibra de vidrio / resina náutica-industrial)** — Trabajan con resinas, fibras, gel coats y catalizadores en combinación. Motivador: técnico (asesoramiento en mezcla/curado) y disponibilidad. Objeción típica: stock de la combinación completa (no sirve la resina sin el catalizador correspondiente). Argumento: Resinplast como unidad especializada, más autoridad técnica que un generalista; ofrecer combo completo. Familia: RESINPLAST completa. Next step: preguntar primero qué está fabricando/reparando, no qué producto quiere.

**8. Clientes Penosil (ferreterías / mayoristas)** — Canal con condición propia: mínimo USD 1.800 + IVA, descuentos 10/15/20% por volumen. Motivador: precio (el segmento donde más pesa). Objeción típica: precio/condición para alcanzar el mínimo, comparación contra otros mayoristas. Argumento: exclusividad de EasySpray en Argentina como gancho que el competidor mayorista no puede ofrecer; calcular junto al cliente cuánto le falta para el próximo tramo de descuento. Familia: PENOSIL completa. Next step: coordinar con CM para que el contacto quede en el Canal Penosil (WhatsApp exclusivo), no mezclado con el canal general.

**9. Consultas B2C (Poliplast Store / web)** — Compra en unidades chicas, sin recurrencia planificada. Motivador: precio y confianza de marca en partes similares. Objeción típica: desconfianza de comprar en sitio propio vs. marketplace conocido / duda si el producto sirve para su necesidad. Argumento: mejora de conversión pasa por completar descripciones claras orientadas a uso no profesional (Shopify tiene 91,7% de productos sin descripción — punto de acción para CM/Diseñador, no solo del vendedor). Productos foco: Espuma Kit 2kg, PoxiPlast, Sogni, accesorios, Cortina PVC. Next step: guía de uso simple, no ficha técnica completa.

**10. Clientes de Mercado Libre** — Canal de mayor tráfico, competencia directa con Fischer (+10k vendidos, 4.8★), Barovo (+1k), Suprabond, Kuwait, Adhematic, Crossmaster. Motivador: precio y confianza, con el algoritmo de ML de por medio (sin publicidad, posición cae a 6+). Objeción típica: comparación directa de precio/reputación. Argumento: acá el "vendedor" es la publicación misma — título con marca+producto+diferencial (60-80 caracteres), mínimo 8-10 fotos, clips 5-10, atributos al 100%, despacho <24hs. Gap urgente detectado: solo 2 publicaciones propias en "Espuma Poliuretano Proyectado Materiales" vs. 16 de Barovo y 15 de Suprabond — quick win para CM/Analista. Next step: consultas directas las responde el Ejecutivo Comercial con el mismo criterio de objeciones; la acción estructural (cerrar el gap de subcatalogación) es tarea de CM/Diseñador con el Analista.

## 9. LinkedIn y posicionamiento personal

### Objetivo

Transformar experiencia invisible en confianza visible. Las personas no reemplazan a las marcas: les dan credibilidad.

### Voces iniciales

- **Felipe:** soluciones industriales, integración del grupo, diagnóstico, aprendizajes de campo y casos nacionales.
- **Ezequiel:** náutica, PRFV, impermeabilización, territorio y aplicación.
- **Brenda:** comercio digital, experiencia del comprador, preguntas frecuentes y operación de marketplace.
- **Grupo Poliplast:** capacidad, equipo, infraestructura, procesos, casos y visión integral.

### Pilares de contenido

1. Problemas que el mercado suele diagnosticar mal.
2. Procesos y detrás de escena.
3. Casos: antes, decisión, solución y resultado.
4. Educación técnica en lenguaje simple.
5. Aprendizajes personales y cultura de trabajo.
6. Integración de unidades del grupo.

### Cadencia inicial sostenible

- Una publicación personal semanal por referente.
- Un video corto semanal reutilizable.
- Una publicación institucional semanal.
- Quince minutos, dos veces por semana, para comentar con criterio en perfiles de clientes y sectores.

No automatizar comentarios genéricos. La presencia personal debe seguir siendo personal.

## 10. Sistema audiovisual comercial

Cada sesión de grabación debe producir activos reutilizables, no videos aislados.

### Formato principal

1. Problema visible.
2. Pregunta de diagnóstico.
3. Explicación breve.
4. Demostración o evidencia.
5. Resultado esperable sin promesas no verificadas.
6. Llamado a conversar o validar la aplicación.

### Reutilización

Una grabación puede generar: clip de Mercado Libre, Reel o Short, video de LinkedIn, estado de WhatsApp, material para una conversación comercial, fragmento para ficha o capacitación interna.

### Biblioteca

Etiquetar cada pieza por: familia, problema, industria, etapa comercial, objeción que ayuda a resolver, persona que aparece, fecha y vigencia técnica.

## 11. CRM: traducción mínima del método

El CRM debe ayudar a decidir y recordar, no agregar burocracia.

### Ficha única por empresa

Empresa; personas y teléfonos asociados; familia o industrias relevantes; resultado de triage (sección 6); situación y problema; diagnóstico vigente; solución o unidades sugeridas; objeción principal; próximo paso; última actividad; origen; motivo de pérdida o no prioridad; recompra estimada y venta cruzada.

### Automatización permitida

El sistema puede: prellenar hipótesis, detectar información faltante, sugerir preguntas, proponer una clasificación, alertar compromisos vencidos, recomendar contenido o ficha técnica, resumir conversaciones, detectar posibles recompras.

El sistema no debe: enviar sin aprobación, inventar datos técnicos, precio o stock, clasificar definitivamente sin trazabilidad, generar una tarea para cada contacto, cambiar silenciosamente una decisión humana.

### Cuándo crear una tarea

Solo cuando exista: compromiso con fecha, Prioridad A, reclamo o urgencia, cotización pendiente, cliente caliente sin respuesta, recompra probable, revisión explícitamente acordada.

### 11.1 Módulo Ventas y Comisiones

Se distinguen tres estados para no declarar operativo algo que solo existe como especificación:

| Elemento | Estado | Detalle |
|---|---|---|
| Reglas de comisión (Poliocho 1%, Poliplast 3% sobre neto sin IVA) | **Especificado** | Definido en `docs/MODULO_VENTAS_Y_COMISIONES.md`, confirmado por Felipe el 02/09. |
| Series de facturación (Poliocho `0003`; Poliplast/PURMAC `0006`/`0011`/`0013`/`0016`) | **Especificado** | Reglas confirmadas, aún no verificadas contra un mes completo real. |
| Pantallas (Mis ventas, Registrar venta, Resumen mensual, Importar/Exportar) | **Implementado parcialmente** | Registro manual y cálculo de comisión activos en `src/Sales.jsx` y `src/sales-model.mjs` (confirmado en el repositorio, commits recientes sobre cálculo de comisiones y detección de facturas duplicadas). Importación CSV de `Ventas 2026` y conciliación mensual: pendiente. |
| Validación contra un mes real de facturación | **No validado** | La hoja `Ventas 2026` sigue siendo el respaldo hasta conciliar al menos un mes completo. No se declara el módulo como fuente operativa hasta esa conciliación. |

Una venta puede vincularse a un cliente y a una Oportunidad ganada, pero no es obligatorio. Registrar una venta no crea automáticamente una tarea. Puede sugerir recompra según familia o frecuencia, siempre como ayuda memoria.

## 12. Rutina del equipo

### Diario — cada comercial

1. Revisar Prioridad A (sección 6) y compromisos del día.
2. Atender entradas urgentes.
3. Ejecutar prospección o seguimiento enfocado según el orden de la mañana (sección 6.2).
4. Registrar únicamente cambios de etapa (CRM, sección 5.1), diagnóstico o próximo paso.
5. Cerrar el día sin promesas vencidas invisibles.

### Semanal — 30 a 45 minutos

1. Revisar embudo y métricas (sección 14).
2. Escuchar o leer dos conversaciones reales.
3. Trabajar una objeción de la biblioteca (sección 7).
4. Compartir un aprendizaje de cliente.
5. Elegir cuentas prioritarias de la semana siguiente.
6. Elegir contenido a producir desde preguntas reales.

### Mensual

1. Nuevos clientes y recompra.
2. Facturación outbound y margen cuando esté disponible.
3. Conversión por etapa.
4. Motivos de pérdida.
5. Venta cruzada entre unidades.
6. Contenido que originó conversaciones útiles.
7. Ajustes al triage y a la biblioteca de objeciones.

### Trimestral (60-90 minutos, incluye Dirección)

1. Tendencia trimestral de los indicadores (no solo el corte del mes).
2. Recompra acumulada del trimestre.
3. Revisión del propio triage: ¿las 6 variables siguen siendo las correctas?
4. Estado del Proyecto de Transición Comercial (5 Sprints, Notion) si sigue activo ese trimestre — ver sección 16.
5. Revisión de la Matriz ERAC (sección 3.1).
6. Decisión de foco del próximo trimestre por familia/unidad.

## 13. RACI

Las columnas de responsabilidad usan **funciones** (sección 4), no necesariamente personas contratadas específicas.

| Proceso | Responsable | Aprobación final | Consultados | Informados |
|---|---|---|---|---|
| Norte y método comercial | Felipe | Dirección | Equipo comercial | Todo el equipo |
| Triage y diagnóstico | Cada comercial | Felipe durante piloto | Función técnica / unidad | CRM |
| Objeciones | Cada comercial aporta casos | Felipe | Claude y Codex | Equipo comercial |
| LinkedIn personal | Cada referente | Felipe / función Comunicación (CM) | Función CM | Equipo |
| Video | Felipe y responsables de producto | Función Comunicación / técnico | Ventas | Equipo |
| Contenido Mercado Libre (fotos, video, título, categoría) | Función CM / Diseñador | Felipe | Función Analista | Equipo comercial |
| CRM y automatizaciones | Codex | Felipe | Claude / usuarios | Equipo comercial |
| Formación | Felipe | Dirección | Claude / especialistas | Equipo comercial |

## 14. Métricas

### Actividad

Leads identificados; contactos efectivos; diagnósticos completados; propuestas; seguimientos cumplidos.

### Conversión

Triage a diagnóstico; diagnóstico a propuesta; propuesta a venta; tiempo medio entre etapas; motivos de pérdida.

### Valor

Clientes nuevos; facturación outbound; margen cuando exista fuente confiable; recompra; venta cruzada; referencias recibidas; **comisión liquidada por vendedor y unidad (Poliocho/Poliplast) una vez que el módulo de Ventas y Comisiones esté validado con un mes real (sección 11.1) — hasta entonces, se reporta desde la hoja `Ventas 2026`.**

### Contenido

Piezas publicadas; conversaciones iniciadas; leads atribuidos; contenidos usados por ventas; objeciones resueltas con contenido.

La cantidad de publicaciones o mensajes nunca se interpreta sola como resultado comercial.

## 15. Excepciones

| Situación | Acción |
|---|---|
| No hay encaje | Decirlo con claridad, registrar motivo y no perseguir |
| Falta dato técnico | Consultar fuente o especialista antes de afirmar |
| Contacto personal o interno | Excluir del flujo comercial sin borrar su existencia |
| Mismo cliente, varios teléfonos | Una empresa, varios contactos; un único diagnóstico y triage |
| Contacto influenciador, no comprador | Registrar su rol y mapear al decisor |
| Reclamo | Prioridad de resolución antes que nueva venta |
| Cliente pide solo precio | Darlo si está autorizado y hacer una pregunta breve de contexto |
| Cliente deja de responder | Seguir la cadencia acordada y luego pasar a nutrición, no hostigar |
| Producto no disponible | Ofrecer alternativa solo si técnicamente corresponde |

## 16. Datos pendientes de validación

Nada de esta tabla se completa por inferencia — queda explícitamente abierto hasta que Felipe lo confirme.

| Dato | Estado | Por qué importa |
|---|---|---|
| Ejecutivo Comercial adicional (más allá de Felipe/Ezequiel/Brenda) | Pendiente de confirmación de Felipe | Define el RACI y la carga de trabajo real del equipo |
| Condiciones de venta mayorista para PURMAC, RESINPLAST, POLIURETANOS y otras familias fuera de Penosil | Pendiente — solo Penosil tiene condición documentada (USD 1.800+IVA, 10/15/20%) | Necesario para la etapa de Propuesta (sección 5.2) |
| Tiempos de entrega reales por zona/familia | Pendiente | Necesario para el argumento de venta y para fijar expectativas en Propuesta |
| Política de crédito / cuenta corriente | Pendiente | Afecta directamente la etapa de Negociación |
| Capacidad de producción / stock real de Foam Factory frente a pedidos grandes | Pendiente | Condiciona compromisos de entrega |
| Criterio formal de cuántos intentos de seguimiento corresponden antes de reclasificar una cuenta | Sugerido (3 intentos en 3 semanas) pero no validado formalmente | Afecta la etapa de Seguimiento (sección 5.2) |
| Objetivos de venta o cuota por vendedor/familia | Pendiente | No hay meta cuantitativa contra la cual medir el método |
| Argumentario de precio/valor frente a competidores de marca reconocida (Sika, Fischer) | Pendiente | Necesario para la objeción "es caro" (sección 7) |
| Vigencia y contenido del Proyecto de Transición Comercial (5 Sprints, Notion) | Pendiente de revisión — se conserva como antecedente, no se declara reemplazado | Podría solaparse con este manual; no se asume sin leerlo |
| Capacidad real de contactos diarios que puede sostener el equipo | Pendiente | Condiciona el plan de implementación (sección 17) |

## 17. Plan de implementación: 9 al 18 de septiembre de 2026

**Nota sobre el estado técnico:** este plan no usa los porcentajes de avance del 28/08 ("CRM 45% / Meta 65%") porque son un corte histórico, no el estado vigente. Verificado contra el repositorio el 09/09: el proyecto tiene desarrollo activo y continuo (commits del mismo día en Sales.jsx, cálculo de comisiones, filtros de Historial, conector multicuenta de Mercado Libre, eventos de WhatsApp). El método de 12 etapas ya está en producción en `Oportunidades`. Un estado de avance porcentual actualizado por frente (WhatsApp, Meta, operación productiva) debe pedirse directamente a Codex antes de comprometer fechas — no se estima acá para evitar repetir el mismo error.

### Día 1 — Documento y lenguaje común

- Validar este documento con Felipe.
- Confirmar que la tabla de equivalencias (sección 5.1) es clara para el equipo.
- Acordar significado de Exposición y Ticket por unidad (triage, sección 6).

### Día 2 — Triage piloto

- Aplicar el triage único a 10 casos reales de Cohorte 1.
- Medir si puede completarse en menos de dos minutos.
- Ajustar preguntas y umbrales si hace falta.

### Día 3 — Diagnóstico

- Convertir cinco conversaciones reales en diagnósticos usando las 4 preguntas SPIN.
- Comparar qué entendió Felipe con lo que sugiere el sistema.

### Día 4 — Objeciones

- Reunir objeciones reales de la semana y ubicarlas en la biblioteca fusionada (sección 7).
- Marcar cuáles necesitan una respuesta nueva no cubierta todavía.

### Día 5 — CRM, verificación de campos

- Confirmar con Codex que los campos de la Ficha única (sección 11) están completos.
- Evitar duplicar ficha, triage o tarea.

### Día 6 — CRM, ajustes si corresponden

- Revisar con Codex si el triage único requiere algún campo nuevo o alcanza con los existentes.
- Mantener edición humana y trazabilidad.

### Día 7 — LinkedIn y video

- Ajustar perfiles de referentes.
- Definir tres series de contenido.
- Preparar primeros guiones desde preguntas reales.

### Día 8 — Entrenamiento

- Simular apertura, diagnóstico, objeción y cierre con el proceso único.
- Evaluar sobre conversaciones reales anonimizadas.

### Día 9 — QA y continuidad

- Probar el recorrido completo con la Cohorte 1.
- Documentar pendientes (sección 16), responsables y siguiente sprint.
- Entregar handoff de continuidad (sección 21).

## 18. División de trabajo: Felipe, Codex y Claude

### Felipe

Aporta decisiones y contexto que no puede inferirse; ejecuta conversaciones reales; valida lenguaje, prioridades y límites; comparte objeciones y resultados; aprueba cambios de alcance o acciones externas; resuelve la tabla de datos pendientes (sección 16).

### Codex

Mantiene el CRM (`Oportunidades`, `Ventas y Comisiones`) y su código; verifica que este manual y el CRM sigan alineados; prueba identidad, persistencia, seguridad y experiencia; integra datos y automatizaciones; entrega evidencia técnica y handoffs; confirma el estado real de avance por frente cuando se le pida.

### Claude

Desarrolla metodología, guiones y entrenamiento; sintetiza conversaciones y objeciones reales; prepara materiales pedagógicos; ayuda a convertir aprendizajes en playbooks; no modifica la arquitectura técnica, el CRM ni Supabase sin coordinación explícita.

### Regla de coordinación

El documento define el método. El CRM registra la operación. Trello administra trabajo. Drive conserva activos y fuentes. Ninguno reemplaza a los demás ni se duplica como fuente canónica.

## 19. Backlog posterior

### 19.1 Orden de implementación del CRM (definido por Marketing, 09/09/2026 — reemplaza cualquier orden anterior)

No se implementan las mejoras del CRM todas juntas. El primer bloque a ejecutar es **identidad única + persistencia + clasificación rápida** — sin eso, agregar más pantallas solo agranda un CRM todavía inconsistente.

1. **Identidad única del cliente:** una empresa puede tener varias personas y teléfonos, pero temperatura, familia, condición comercial e historial se registran una sola vez. **Implementación base cerrada (10/09/2026):** fusión automática desactivada; detector y pantalla de posibles duplicados construidos; rendimiento corregido para carteras grandes; alta, edición, baja y elección de contacto principal disponibles dentro de una empresa. Felipe difirió la fusión reversible y las acciones sobre candidatos. Sigue pendiente la clasificación no comercial persistente a nivel de persona y el QA con casos reales. Detalle en sección 21 y en `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md`.
2. **Clasificación rápida:** el copiloto precompleta familia, intención, temperatura y triage (sección 6); el vendedor solo confirma o corrige.
3. **Persistencia verdadera:** tareas completadas, contactos no comerciales, archivos y eliminaciones no pueden reaparecer al recargar.
4. **Historial útil:** cliente único, filtros por fecha/familia/temperatura, sin duplicación General/Penosil.
5. **Seguimiento inteligente:** crear recordatorio solo cuando hay compromiso, urgencia o riesgo real — no una tarea por cada conversación.
6. **Ventas y comisiones:** completar y validar el módulo (sección 11.1) con facturas reales.
7. **Después:** alerta de tipo de cambio, botón "Armar seguimiento", mejoras del copiloto.

**Continuación aprobada (10/09/2026):** una vez que cierre el bloque #1, la secuencia se extiende hacia el CRM como copiloto comercial ("Academia comercial" + ayuda contextual + aprendizaje con casos reales) según `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md` — ese documento desarrolla en detalle los ítems 2 y 5 de esta lista y absorbe varios de los puntos de la sección 19.2 (biblioteca de objeciones estructurada, matriz de mensajes por etapa, casos comerciales estandarizados). No reemplaza este orden, lo continúa.

### 19.2 Otros pendientes

Tablero de triage y conversión; rutas de cross-selling; programa de referidos; onboarding para nuevos vendedores; formación y certificación interna (ver `PROGRAMA_FORMACION_COMERCIAL_4_SEMANAS.md`); integración de Google Calendar; panel de dirección y forecasting basado en datos reales.

*(Biblioteca de objeciones ampliada, matriz de mensajes por etapa, casos comerciales estandarizados y asistente de IA con fuentes técnicas verificadas pasaron a `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md`, donde están desarrollados con más detalle que en esta lista.)*

## 20. Criterio de éxito

El sistema estará funcionando cuando un comercial nuevo pueda, leyendo únicamente este documento:

1. entender a quién priorizar (triage único, sección 6);
2. conducir una conversación de descubrimiento (SPIN, sección 3, y macroetapas, sección 5);
3. construir un diagnóstico básico (Gap Selling, sección 3);
4. encontrar la respuesta o fuente correcta (biblioteca de objeciones, sección 7, playbooks, sección 8);
5. manejar una objeción sin improvisar ni mentir (E-C-E-R-A, sección 7);
6. acordar y registrar el próximo paso en el CRM (sección 5.1);
7. retomar la relación sin depender de la memoria de otra persona;
8. mostrar el valor integral de Grupo Poliplast (sección 2).

El objetivo final no es tener el CRM más lleno. Es crear un equipo que venda mejor, aprenda más rápido y genere una experiencia comercial difícil de copiar.

## 21. Continuidad Codex → Claude (hasta el 18/09/2026)

Espacio vivo para que Codex documente, a medida que ocurre, el estado técnico y las decisiones nuevas relevantes para este manual, de forma que Claude pueda incorporarlas sin depender de una sesión de chat específica.

**Formato sugerido por entrada:** fecha, qué cambió técnicamente (con referencia a commit o archivo), qué decisión de negocio quedó confirmada, qué impacto tiene sobre este manual (qué sección debería actualizarse).

**07/09/2026 — Claude, vía `Auditoria_Sistema_Comercial.html` (panel ejecutivo visual, no canónico, resumen técnico con trazabilidad por fuente/fecha/responsable/confianza):**

- CRM (Poliplast Sales Copilot): construido y desplegado en producción (Vercel + Supabase). Adopción real por Felipe/Ezequiel/Brenda: **sin evidencia suficiente** — no hay criterio de medición acordado todavía (pendiente que Felipe lo defina).
- WhatsApp General y Juan: operativos 100% por Meta Cloud API oficial. WhatsApp Penosil: el puente/extensión de Chrome que mezclaba identidades fue **retirado definitivamente** el 04/09 (los ~482 eventos históricos contaminados se borraron); pasó al mismo canal oficial Meta Cloud API con webhook ya suscripto. Único paso pendiente: activar la coexistencia del número físico y confirmar un mensaje entrante real.
- Trello sigue siendo el tablero maestro de proyectos — no fue migrado al CRM (el CRM registra operación comercial diaria, Trello registra proyectos e iniciativas).
- El Plan Comercial no fue eliminado — sigue como dirección estratégica y rutina.
- Inventario existe como desarrollo en curso: repo `eca-sistema`, branch `feature/inventario-conteo-fisico`, pendiente de validación antes de producción.
- Catálogo Maestro v12 es la referencia conocida hoy, pero cantidad y alcance exacto siguen sin comprobar contra la fuente viva (versiones previas oscilaron entre ~1.749 y ~2.102 productos). Recomendación registrada: no importar 1.000+ registros de una — validar identidad, deduplicación, mapeo de campos y rollback con una muestra chica (20-50) antes de escalar.
- Automatizaciones activas desde el 07/09: Catálogo WhatsApp completo (diaria), Marketplace lote 50 (diaria), Contenido Penosil (semanal, lunes) — las 4 tareas de prospección en la nube siguen pausadas. Tareas de escritorio (brief semanal, auditoría ML semanal) sin confirmar.
- Impacto sobre este manual: ninguna decisión de las secciones 5-17 cambia por esta actualización — es información técnica complementaria, no una revisión del método. Actualiza el contexto de la sección 17 (dependencias técnicas) y dato pendiente de "capacidad real de contactos diarios" (sección 16) sigue abierto.

*(Próxima entrada: cuando Codex confirme coexistencia de Penosil o valide Inventario.)*

**09/09/2026 — Marketing, foco operativo hasta el 18/09 (reemplaza cualquier plan de tareas anterior):**

- **Marketplace — catálogo completo hasta 18/09:** activo, 30-50 publicaciones diarias completas. Avanza sin interrumpir salvo al finalizar el lote o ante un bloqueo real.
- **Shopify — miércoles y viernes:** activo, solo análisis y aprendizaje; no modifica la tienda.
- **Catálogo WhatsApp completo:** pausado.
- **Contenido Penosil:** pausado.
- **CRM:** trabajo interactivo, sin automatización descontrolada — ver orden de implementación en sección 19.1.
- Cohorte 1 continúa por Felipe; sus respuestas alimentan el triage (sección 6) y la biblioteca de objeciones (sección 7) a medida que llegan.
- Codex tiene múltiples chats históricos repetidos — no se borran, se archivan; quedan visibles solo Marketplace, CRM, Shopify y continuidad comercial.
- Cierre previsto 17-18/09: documentación y handoff completo a Claude.
- Versionado: commit `4cfd48d` en GitHub (repo `poliplast-sales-copilot`). El `.git/index.lock` trabado que había quedado de una sesión anterior fue reubicado a un archivo recuperable, no borrado.
- "Fase 6" confirmado como cerrado (Anexo A): costos, precios y rentabilidad del frente Catálogo — no es una fase del sistema comercial.

**10/09/2026 — Marketing/Codex, avance del bloque #1 de identidad única (commits `f09313e` y `e2e77f7`):**

- `consolidateDuplicateClients` (fusión automática por nombre de empresa en cada sincronización) fue **desactivada**. Se confirmaron duplicados reales visibles en producción (Carrocería Argentina, Ferref Refrigeración, Metalúrgica Bonano) sin fusionar, eliminar ni migrar ningún cliente existente. Se agregó una prueba que garantiza que dos fichas con el mismo nombre permanezcan separadas.
- Se construyó un **detector de posibles duplicados** de solo lectura: evalúa CUIT, teléfono, email, razón social y nombre comercial; cada candidato indica por qué apareció; coincidencia de nombre sola queda siempre en confianza baja; ningún candidato se fusiona automáticamente, ni siquiera en confianza alta. 165 pruebas y compilación completa pasando; producción responde correctamente en General y Penosil.
- Pendiente todavía (siguiente bloque, ya scopeado por Codex): pantalla "Posibles duplicados" dentro de Empresas (confianza alta visible primero, baja oculta por defecto), acciones Revisar / No son duplicados / Postergar, vista lado a lado de datos/temperatura/contactos/historial, y recién después Fusionar con registro y deshacer.
- **Decisiones de Felipe sobre las 4 preguntas abiertas de `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md` (Anexo, esa misma ficha):**
  1. El cliente se clasifica **una sola vez** (historial e identidad unificados); productos, intereses y conversaciones se mantienen separados por unidad de negocio/canal, pero **no** hay dos temperaturas independientes para el mismo cliente.
  2. Fusiones administradas **solo por Felipe** al inicio; más adelante podrá habilitarse a supervisores, no a cualquier comercial.
  3. Candidatos de confianza alta: confirmación con **un clic** después de ver el resumen; pedir campo por campo únicamente cuando hay conflictos reales de datos.
  4. Fusiones históricas ya ocurridas (antes de desactivar `consolidateDuplicateClients`): primero el diagnóstico completo de solo lectura; después revisar prioritariamente las empresas con más ventas, tareas o actividad.
- Impacto sobre este manual: actualiza el estado del bloque #1 de la sección 19.1. No cambia método, triage, objeciones ni playbooks (secciones 5-8).

**10/09/2026 — Marketing, arquitectura de "CRM como copiloto comercial" (nuevo documento `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md`):**

- Definición aprobada del diferencial real del CRM: no solo registrar ventas, sino enseñar y acompañar al vendedor durante la conversación, en tres niveles — ayuda contextual (sugerencias atadas a la conversación abierta), Academia comercial (fusión de Respuestas + Entrenador en una sola sección), y aprendizaje con casos reales (estadísticas comerciales basadas en resultados, no en supuestos).
- Se agregó a `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md` (sección 5.1) el detalle de qué debe mostrar la pantalla de comparación antes de fusionar dos fichas (empresa que se conserva, teléfonos/personas que se incorporan, historial/tareas que se trasladan, valores en conflicto, opción de deshacer) — queda documentado para cuando se construya ese bloque, no es el que se está construyendo ahora.
- Orden recomendado para después del cierre del bloque #1 (identidad única): Academia comercial → objeciones/playbooks como datos editables → consejos contextuales en pantalla → triage rápido (ya en sección 19.1) → registrar si una sugerencia funcionó → estadísticas comerciales → recién al final, IA generativa para borradores, condicionada a tener biblioteca estructurada y datos reales.
- No se espera a que Claude termine de mejorar el contenido del manual para que Codex empiece a construir el contenedor (arquitectura de los tres niveles) — avanzan en paralelo; las versiones aprobadas del manual se sincronizan sobre esa arquitectura.
- Impacto sobre este manual: actualiza sección 19.1 (agrega continuación aprobada tras el bloque #1) y sección 19.2 (varios ítems se absorben en el nuevo documento, con nota de referencia). No cambia método, triage, objeciones ni playbooks (secciones 5-8) — el nuevo documento es de arquitectura de interfaz, no de contenido comercial.

**10/09/2026 — Codex, cierre de la base utilizable de identidad única (commits `2b31da0`, `adaa155` y `c84cdcb`):**

- Se incorporó en Empresas la revisión de posibles duplicados en modo solo lectura, sin fusionar ni alterar datos reales.
- Se reemplazó la comparación cuadrática de toda la cartera por índices de CUIT, teléfono, email y nombres. La prueba con 2.001 clientes evita que la pantalla Empresas vuelva a trabarse por este cálculo.
- La ficha Empresa ahora permite varias personas y medios de contacto, elección de principal, edición y baja individual. El buscador contempla cualquiera de esos datos.
- Verificación: 167 pruebas automatizadas y compilación de producción completas.
- Decisión de Felipe: las acciones de candidatos y la fusión/deshacer quedan diferidas. El próximo frente habilitado es Academia comercial; identidad conserva como pendientes la clasificación no comercial por persona y el QA real.

---

**16/09/2026 — Codex, corrección sobre el estado de WhatsApp (`docs/REPORTE_CODEX_PARA_CLAUDE_2026-09-15.md`, commit `e7c5631`):**

- Corrige la entrada del 07/09/2026: "WhatsApp General y Juan: operativos 100%" es impreciso y queda sin efecto. Estado real verificado:
  - **WhatsApp General:** en uso operativo. No modificar sin regresión comprobada.
  - **WhatsApp Juan:** funciona como canal independiente, pero **no está integrado al CRM** — decisión deliberada de Felipe de no integrarlo hasta consolidar primero WhatsApp General dentro del CRM.
  - **WhatsApp Penosil:** diferido por decisión de Felipe, no por falla técnica. Arquitectura oficial Meta Cloud API construida; coexistencia del número físico y confirmación de un mensaje entrante real siguen pendientes.
- El 81,2% de la décima auditoría es un índice de madurez técnica del CRM (promedio de 10 frentes: UX, UI, automatización, practicidad, backend, frontend, datos, testing, documentación y seguridad) — no mide adopción operativa de WhatsApp, Meta ni del negocio.
- Impacto sobre este manual: reemplaza la lectura de la entrada del 07/09 sobre WhatsApp. No cambia método, triage, objeciones ni playbooks (secciones 5-8).

## Anexo A — Qué era la "Fase 6"

"Fase 6" **no pertenece al proceso comercial** y no se agrega como fase de ventas en este manual. Corresponde al frente Catálogo/Compras: en la ruta de 8 fases de ese frente (`claude/VENTAS_y_Prospeccion.md`, sección 6), Fase 6 = costos, precios y rentabilidad del catálogo (Costo USD, Precio Final USD, Markup, Margen), con avance histórico ~65% al 26/08. Se referencia acá únicamente como **dependencia**: los precios y márgenes que ese frente vaya confirmando alimentan la etapa de Propuesta (sección 5.2) y el futuro Cotizador — no como parte de este proceso.

## Anexo B — Documentos absorbidos y respaldo histórico

Ver sección 0 (Control de versión). Copia de la versión anterior de este documento en `docs/historico/SISTEMA_COMERCIAL_GRUPO_POLIPLAST_v1_2026-09-09.md`. Documentos fuente absorbidos, conservados sin edición en `claude/` del proyecto de Claude: `DIAGNOSTICO_Y_METODO_COMERCIAL_POLIPLAST.md`, `SISTEMA_DE_CALIFICACION_Y_PRIORIZACION.md`, `BIBLIOTECA_DE_CONVERSACIONES_Y_OBJECIONES.md`, `PLAYBOOKS_COMERCIALES_POR_SEGMENTO.md`.
