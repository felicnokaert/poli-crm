# Prompt para Claude Code - continuidad base técnica y CRM

Trabajá sobre `felicnokaert/poli-crm`, respetando el estado de producción y sin modificar datos reales ni reorganizar Google Drive de forma destructiva.

## Estado dejado por Codex el 10/09/2026

- CRM en producción, WhatsApp General operativo.
- Penosil y Juan diferidos por decisión de Felipe.
- 12 etapas comerciales unificadas; Ganado/Perdido/Pausado son resultados.
- Clasificar una conversación sin fecha y acción explícitas ya no crea tareas.
- Trello es el único tablero maestro de proyectos.
- Manual de uso y QA operativo publicados en el repo.
- `src/technical-library.mjs` contiene 31 documentos por metadata, todos sin validar.
- Se agregó `src/technical-document-governance.mjs` con estados documentales, normalización, detección de duplicados exactos/posibles y regla que impide citar datos sin fuente vigente y validada.
- Especificación canónica: `docs/BASE_CONOCIMIENTO_TECNICA_SPEC.md`.

## Orden de trabajo

1. Leer completos `docs/HANDOFF_CODEX_A_CLAUDE_2026-09-18.md`, `docs/BASE_CONOCIMIENTO_TECNICA_SPEC.md`, `docs/COPILOTO_COMERCIAL_ARQUITECTURA.md` y `docs/IDENTIDAD_UNICA_CLIENTE_SPEC.md` antes de editar.
2. Verificar tests y build antes de cambiar código.
3. No duplicar `technical-library.mjs`; migrarlo gradualmente al modelo de gobernanza.
4. Construir primero un importador de inventario con vista previa. Debe informar nuevos, modificados, duplicados exactos, posibles duplicados y errores antes de guardar.
5. No mover ni borrar documentos de Drive. No marcar ninguno como vigente automáticamente.
6. Mantener Drive como fuente original, Catálogo Maestro como identidad de producto y Contabilium como fuente futura de precio/costo/stock.
7. Empezar con una familia piloto de 5-10 documentos; no cargar todo Penosil todavía.
8. Toda respuesta técnica debe citar documento y ubicación. Si falta validación, decirlo explícitamente.
9. No conectar IA generativa paga ni envío automático de WhatsApp en esta fase.
10. Mantener o aumentar cobertura de pruebas y actualizar el handoff con commit, evidencia y pendientes reales.

## Próximos bloques separados

- Limpieza controlada de tareas automáticas históricas.
- Identidad única: comparación, fusión manual reversible y log.
- Validación de Ventas/comisiones con una operación real.
- Mercado Libre cuando finalice la autorización externa.

No mezcles esos bloques con la base técnica en un mismo cambio grande. Priorizá cambios pequeños, revisables y con rollback.
