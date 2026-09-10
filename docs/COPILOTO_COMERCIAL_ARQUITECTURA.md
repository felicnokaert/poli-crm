# Arquitectura: CRM como copiloto comercial (Academia Comercial)

**Estado:** Diseño aprobado por Marketing (10/09/2026). Auditoría del contenedor existente completada; implementación de la Academia todavía no iniciada.
**Autor:** Diseño de Marketing, formalizado por Claude (Cowork).
**Fecha:** 10/09/2026.
**Prioridad:** Bloque siguiente al cierre de identidad única (ver manual, Sección 19.1, y este documento, Sección 5).
**Para:** Codex (implementación), Felipe (validación de contenido y prioridades).

---

## 0. Por qué este documento existe

El diferencial real del CRM no es que registre ventas — eso lo hace cualquier planilla. El diferencial es que **enseñe y acompañe al vendedor durante la conversación**, usando el método comercial que ya está consolidado en `docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md` (12 etapas, triage único, biblioteca de objeciones, E-C-E-R-A, 10 playbooks). Hoy ese conocimiento existe pero vive distribuido en documentos: no aparece en el momento exacto en que el vendedor lo necesita.

Este documento define cómo llevar ese manual al CRM sin convertirlo en una pantalla enorme que nadie va a leer, y sin abrir un cuarto lugar donde buscar información (ver principio de consolidación en `ways-of-working`). No reemplaza al manual — el manual sigue siendo la fuente canónica del método; este documento es la arquitectura de cómo ese método se vuelve interfaz.

---

## 1. Los tres niveles

### 1.1 Ayuda contextual durante el trabajo

Cuando Felipe o un vendedor abre una conversación (Bandeja, ficha de Empresa, o Registro de conversación), el CRM debería mostrar, sin que nadie tenga que ir a buscarlo:

- Perfil probable del cliente.
- Familia recomendada.
- Etapa comercial actual (de las 12, sección 5.1 del manual).
- Preguntas de diagnóstico sugeridas (SPIN/Gap Selling, sección 3 del manual).
- Triage precompletado (sección 6 del manual).
- Objeción detectada.
- Respuesta sugerida mediante E-C-E-R-A (sección 7 del manual).
- Producto o unidad de negocio para venta cruzada.
- Fuente técnica que respalda la recomendación (nunca una afirmación sin fuente — principio ya vigente de "no prometer sin ficha técnica").
- Próximo paso sugerido.

**Ejemplo** (tal como lo planteó Marketing):

> Cliente: fabricante de cámaras frigoríficas
> Perfil: aislamiento industrial
> Antes de cotizar, confirmar superficie, espesor, temperatura de trabajo y fecha de obra.
> Objeción probable: rendimiento/precio.
> No prometer rendimiento sin revisar la ficha técnica correspondiente.

Esto es lo que separa "ayuda contextual" de un genérico "consejo del día": está atado a la conversación puntual que el vendedor tiene abierta, no es un tip aislado.

### 1.2 Academia comercial dentro del CRM

Reconvertir las secciones actuales **Respuestas** y **Entrenador** en una sola sección — por ejemplo, "Academia comercial" — para no agregar un módulo suelto más que nadie termina de entender. Contenido:

- Proceso comercial de 12 etapas.
- Triage único (ex-6 variables, ahora fusionado).
- Biblioteca de objeciones.
- Método E-C-E-R-A.
- Los 10 perfiles/playbooks de clientes.
- Preguntas de escucha activa.
- Argumentos de valor de Grupo Poliplast.
- Venta cruzada entre unidades de negocio.
- Casos reales (alimentados por el Nivel 3, sección 1.3).
- Guiones de apertura y seguimiento.
- LinkedIn y posicionamiento comercial.
- Biblioteca de videos y materiales.
- Entrenamiento con simulaciones.

Este nivel aprovecha y mejora lo que ya existe (Respuestas, Entrenador) en vez de sumar módulos nuevos que compitan por atención.

### 1.3 Aprendizaje con casos reales

Esta es la parte más valiosa a largo plazo, y la que convierte el manual en inteligencia comercial propia de Poliplast en vez de teoría estática.

Después de una conversación, el vendedor registra:

- Qué necesitaba el cliente.
- Qué objeción apareció.
- Qué respuesta se utilizó.
- Si funcionó o no.
- Qué producto terminó comprando.
- Por qué se perdió, pausó o cerró.

Con eso acumulado, el CRM empieza a mostrar datos reales, no supuestos:

- Objeciones más frecuentes por familia.
- Respuestas que mejor convierten.
- Perfiles con mayor tasa de cierre.
- Familias que suelen venderse juntas.
- Tiempo promedio entre contacto y cierre.
- Motivos reales de pérdida.
- Contenido que ayudó a conseguir ventas.

Esto es consistente con el roadmap ya existente (`PRODUCT_ROADMAP.md`, "Entrenamiento continuo: Felipe marca si la interpretación y el próximo paso fueron útiles; el sistema conserva las correcciones como reglas comerciales") — este documento lo desarrolla en profundidad, no lo reemplaza.

---

## 2. Flujo

```
Mensaje o prospecto
        ↓
Identificar empresa y persona          ← depende de identidad única (spec aparte)
        ↓
Perfil + familia probable
        ↓
Triage y preguntas de diagnóstico       ← Nivel 1 (ayuda contextual)
        ↓
Etapa comercial
        ↓
Objeción + respuesta sugerida           ← Nivel 1, con fuente en Nivel 2 (Academia)
        ↓
Propuesta / seguimiento
        ↓
Venta, pausa o pérdida
        ↓
Aprendizaje para futuros vendedores     ← Nivel 3 (casos reales)
```

El primer eslabón ("Identificar empresa y persona") depende directamente del trabajo de identidad única que ya está en marcha (`docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md`) — sin eso resuelto, cualquier sugerencia contextual del Nivel 1 corre el riesgo de aplicarse sobre una ficha equivocada o duplicada.

---

## 3. Qué ya existe (no se parte de cero)

- Manual comercial consolidado (`docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`).
- Método de 12 etapas, triage único, biblioteca de objeciones, 10 playbooks (todos ya en el manual).
- Reglas del copiloto (parcialmente implementadas — ver `ESTADO_Y_ROADMAP.md`: "Entrenamiento comercial 65%: rúbrica, devolución y casos realistas probados; falta análisis automático con IA").
- Índice de documentos técnicos del proyecto.
- Panel de sugerencias, Respuestas rápidas, Entrenador, Historial de conversaciones (módulos existentes en el CRM, a reconvertir según Sección 1.2 — su código puntual no fue releído para este documento y debe verificarse contra el repo antes de tocarlos).
- Empresas, contactos, ventas y comisiones (módulos ya operativos).

El problema no es falta de contenido — es que está distribuido y no aparece en el momento exacto en que el vendedor lo necesita. Este documento no inventa contenido nuevo: reorganiza y conecta lo que ya está aprobado.

---

## 4. Nota pendiente heredada de identidad única: comparación antes de fusionar

Marketing pidió — para cuando se implemente la fusión reversible del bloque de identidad única, no ahora — que antes de unir dos fichas duplicadas el CRM muestre una comparación explícita con:

- Qué empresa se conserva.
- Qué teléfonos y personas se incorporan.
- Qué historial y tareas se trasladan.
- Qué valores están en conflicto.
- Posibilidad de deshacer la unión.

Esto ya estaba cubierto en términos generales en `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md` (Sección 5, "Flujo de fusión y deshacer", y Sección 3.5, `mergeLog`), pero se agrega ahí el detalle explícito de qué debe mostrar la pantalla de comparación, para que Codex lo tenga a mano cuando llegue a esa etapa. **No es parte del próximo bloque a construir** — queda documentado y en espera, como se acordó.

---

## 5. Orden recomendado (extiende la Sección 19.1 del manual)

La Sección 19.1 del manual ya fija el bloque #1 (identidad única) como el primero y en curso. Este documento extiende esa secuencia hacia adelante, incorporando la dirección de "copiloto/Academia":

1. Terminar de validar identidad única y el rendimiento de Empresas (bloque #1, ya en curso — ver `IDENTIDAD_UNICA_CLIENTE_SPEC.md`).
2. Construir "Academia comercial" unificando Respuestas + Entrenador (Sección 1.2 de este documento).
3. Estructurar objeciones y playbooks como datos editables, no texto incrustado en código — para que actualizar la biblioteca de objeciones (que crece con Cohorte 1) no requiera un deploy.
4. Mostrar consejos contextuales en Empresa, Bandeja y Registro de conversación (Sección 1.1 de este documento).
5. Incorporar triage rápido precompletado (ya es el ítem #2 de la Sección 19.1 del manual — se mantiene como está, sin duplicar).
6. Registrar si una sugerencia funcionó (primer paso del Nivel 3).
7. Crear estadísticas comerciales basadas en resultados reales (Sección 1.3 completa).
8. Más adelante, conectar una IA para redactar borradores usando únicamente esta biblioteca y las fichas técnicas verificadas — no antes de tener la biblioteca estructurada (paso 3) y datos reales acumulados (paso 6-7), para evitar que la IA improvise sin fuente.

Esto no reemplaza el orden de la Sección 19.1 del manual (identidad → clasificación rápida → persistencia → historial → seguimiento inteligente → ventas y comisiones); lo continúa una vez que el bloque #1 cierre, y absorbe dentro de sí varios de los ítems que hoy están sueltos en la Sección 19.2 ("otros pendientes": biblioteca de objeciones ampliada, matriz de mensajes por etapa, casos comerciales estandarizados).

---

## 6. Decisiones ya tomadas (no requieren validación adicional de Felipe)

- El CRM no debe mostrar el manual completo como pantalla; se traduce en los tres niveles de este documento.
- Respuestas + Entrenador se fusionan en una sola sección ("Academia comercial"), no se agregan módulos sueltos.
- No se espera a que Claude termine de mejorar el contenido del manual para empezar a diseñar/construir el contenedor: Codex puede avanzar con la arquitectura (Niveles 1-3, estructura de datos de objeciones/playbooks) en paralelo a que Claude siga puliendo el contenido; las versiones aprobadas del manual se sincronizan sobre esa arquitectura ya construida.
- La conexión de una IA generativa para redactar borradores (paso 8) es la última etapa, condicionada a tener biblioteca estructurada y datos reales — no se construye antes.

## 7. Verificación contra código (Codex, 10/09/2026)

- **Biblioteca:** `QuickReplies` muestra respuestas rápidas por canal desde constantes estáticas y agrega debajo `Training`, con role-plays y cadencias también estáticos. Permite copiar texto, pero no editarlo ni medir su resultado.
- **Entrenamiento:** `Coach` trabaja sobre conversaciones registradas, aplica una rúbrica de 14 criterios y guarda puntajes/devolución en cada interacción. Ya es una base válida para el Nivel 3, pero no está conectado con objeciones o playbooks estructurados.
- **Navegación:** Biblioteca y Entrenamiento son hoy dos entradas separadas bajo Recursos. La Academia puede unificarlas en una sola entrada sin perder las funciones existentes.
- **Datos:** no existe todavía una entidad editable de objeciones/playbooks. El contenido aprobado vive en el manual y parte de las respuestas/ejercicios vive en constantes del frontend. El primer cambio debe extraer esa información a un modelo estructurado y testeable antes de rediseñar la pantalla.
