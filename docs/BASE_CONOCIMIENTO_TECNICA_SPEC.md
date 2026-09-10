# Base de conocimiento técnica - Drive, productos y copiloto

**Fecha:** 10/09/2026  
**Estado:** arquitectura y reglas de seguridad implementadas; inventario recursivo, extracción e interfaz pendientes.  
**Fuente documental:** carpeta Drive de Grupo Poliplast `FICHAS TÉCNICAS`.

## 1. Objetivo

Convertir las fichas técnicas, manuales y documentos oficiales de Grupo Poliplast en conocimiento consultable desde el CRM, con trazabilidad y sin permitir que el copiloto invente datos.

No se entrena un modelo con documentos sin control. Drive conserva los originales; el CRM mantiene un índice, contenido extraído, estado de vigencia y referencias a la fuente.

## 2. Estado verificado

- Drive contiene cinco frentes iniciales: informes acústicos, poliuretanos rígidos estructurales, productos, máquinas y repuestos/accesorios.
- Se observaron PDF, DOCX, carpetas de fotografías y posibles versiones repetidas.
- `src/technical-library.mjs` ya indexa 31 documentos por metadata, pero ninguno está validado y todavía no guarda contenido extraído.
- `src/suggestion-rules.mjs` recomienda documentos por familia, pero deliberadamente marca rendimiento, compatibilidad, aplicación, dosificación, seguridad, precio y stock como pendientes de verificar.

## 3. Fuente de verdad

| Información | Fuente |
|---|---|
| Documento técnico original | Google Drive de Grupo Poliplast |
| Producto, familia y SKU comercial | Catálogo Maestro / sistema comercial |
| Precio, costo y stock | Contabilium o fuente operativa aprobada |
| Texto extraído, índice y validación | Base técnica del CRM |
| Proyectos y tareas de implementación | Trello |

El CRM no debe leer archivos desde la computadora de Felipe: eso impediría el uso multiusuario y dependería de que una computadora esté encendida.

## 4. Estados documentales

1. `inventariado`: detectado, todavía sin revisión.
2. `posible_duplicado`: comparte señales con otro archivo; nunca se elimina automáticamente.
3. `pendiente_validacion`: contenido extraído, falta confirmar vigencia.
4. `vigente`: fuente y contenido confirmados por una persona responsable.
5. `desactualizado`: conservado por trazabilidad, no citable.
6. `no_tecnico`: fotografías, gráficas, material comercial u otro archivo no utilizable como ficha.

## 5. Regla de duplicados

- Mismo SHA-256: duplicado exacto demostrable.
- Nombre/tamaño similares: solamente candidato.
- Versiones distintas: conservar ambas y vincular `replacedBy`.
- Ningún documento se borra o mueve durante la auditoría.
- La decisión humana define qué versión queda vigente.

## 6. Regla de respuesta

Un dato técnico solo puede citarse si el documento está `vigente`, tiene fuente, responsable y fecha de validación. Precio y stock nunca se toman de una ficha técnica. Si falta respaldo, el copiloto debe indicar `pendiente de verificar` y formular una pregunta, no completar por probabilidad.

Cada sugerencia futura debe mostrar:

- respuesta editable;
- producto y familia inferidos;
- documento fuente con enlace;
- fecha/versión de la fuente;
- estado de validación;
- campos todavía no verificados.

Nunca se envía una respuesta automáticamente.

## 7. Penosil

No se incorpora todo el sitio. Primero se cruza el catálogo realmente vendido por Poliplast con la documentación oficial en español. Por producto se busca, como mínimo, ficha técnica y ficha de seguridad; declaraciones y certificados se agregan cuando aporten valor comercial o regulatorio.

## 8. Implementación por etapas

1. Inventario recursivo de Drive con ID, URL, ruta, tipo, tamaño y fecha.
2. Hash de archivos descargables y reporte de duplicados exactos/posibles.
3. Cruce con familia, producto y SKU.
4. Extracción de texto de PDF/DOCX, conservando página/sección de origen.
5. Validación humana de una familia piloto.
6. Biblioteca técnica buscable dentro de Academia comercial.
7. Consulta contextual desde Empresa y Por revisar.
8. Aprendizaje por correcciones y casos reales.

## 9. Piloto recomendado

Empezar con Poliuretano o PURMAC: ya cuentan con documentación y consultas comerciales reales. Validar entre 5 y 10 documentos completos antes de escalar. Penosil entra después de tener la lista exacta de productos comercializados.

## 10. Definición de hecho de la primera fase

- Inventario completo, sin modificar Drive.
- Duplicados exactos y posibles separados.
- Cada documento tiene familia, producto, tipo y fuente.
- Ningún documento queda `vigente` sin responsable y fecha.
- Una familia piloto es buscable desde el CRM.
- Una sugerencia puede citar fuente y ubicación verificables.
- Precio y stock permanecen separados del conocimiento técnico.
