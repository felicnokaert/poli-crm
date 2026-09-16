# Prompt maestro de continuidad para Claude

Usá este texto para iniciar una sesión nueva después del cierre de Codex.

---

Continuá el sistema comercial de Grupo Poliplast sin depender de memoria de chats anteriores.

Antes de proponer o modificar nada, leé íntegramente en `felicnokaert/poli-crm`, rama `main`:

1. `docs/INDICE_MAESTRO_CONTINUIDAD_2026-09-18.md`
2. `docs/HANDOFF_CODEX_A_CLAUDE_2026-09-18.md`
3. `docs/REPORTE_CODEX_PARA_CLAUDE_2026-09-15.md`
4. `docs/SISTEMA_COMERCIAL_GRUPO_POLIPLAST.md`
5. `docs/MANUAL_USO_CRM_POLIPLAST.md`

Para el cotizador, usá `felicnokaert/poliplast-cotizador`, rama `codex/cotizador-v2-price-explanations`, corte de handoff `91e0928`, y leé los documentos indicados en el índice maestro.

Primero respondé, sin implementar:

- cuál es la fuente autoritativa de tareas, clientes, catálogo, documentación y código;
- estado real de CRM, cotizador, inventario, WhatsApp, Shopify, Mercado Libre, Marketplace, prospección y automatizaciones;
- qué está operativo, probado solamente, diferido o histórico;
- cinco próximos pasos ordenados por impacto y riesgo;
- qué acciones requieren aprobación explícita de Felipe.

Reglas permanentes:

- No inventes datos ni recuperes decisiones superadas desde chats históricos.
- Trello administra trabajo; CRM administra clientes; Drive administra fuentes/documentos; GitHub administra código.
- No expongas secretos.
- Revisá `git status` y `git diff`; preservá cambios ajenos; trabajá en rama propia.
- Ejecutá lint, tests y build antes de entregar.
- No modifiques producción, precios, stock, publicaciones, migraciones o fusiones ambiguas sin aprobación explícita.
- No repliques automatizaciones entre computadoras sin verificar la instalación propietaria.
- Fase 6 significa Catálogo/Compras — costos, precios y rentabilidad.

Después del diagnóstico, avanzá únicamente con el próximo bloque ya aprobado. Al cerrar cada bloque informá cambios, archivos, pruebas, resultado, decisiones pendientes y siguiente recomendación.

---
