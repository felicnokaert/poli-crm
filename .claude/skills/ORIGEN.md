# Skills de diseño instalados (15/10/2026)

Se usan para mejorar la interfaz del CRM. Se cargan en las sesiones nuevas de Claude Code.

| Skill | Origen | Licencia | Qué se instaló |
|---|---|---|---|
| `taste-skill` (design-taste-frontend) | github.com/Leonxlnx/taste-skill | MIT | La skill completa, con sus scripts locales (inspección con Chrome, búsqueda de imágenes libres CC0). |
| `redesign-skill` | github.com/Leonxlnx/taste-skill | MIT | Auditoría y mejora de interfaces existentes. |
| `ui-ux-pro-max` | github.com/nextlevelbuilder/ui-ux-pro-max-skill | MIT | Base de estilos, paletas y reglas, con sus scripts de consulta (sin los tests). |
| `impeccable` | github.com/pbakaus/impeccable | Apache 2.0 | `SKILL.md`, las guías (`reference/`) y el índice de fuentes. **No se instaló el lanzador/binario** (`scripts/impeccable`) porque descarga un programa en la primera ejecución; la skill funciona sin él leyendo `PRODUCT.md` y `DESIGN.md`. |

Revisión previa: se leyeron las skills y se buscó código de red o de ejecución. Los scripts de taste-skill solo consultan APIs públicas de imágenes libres y hablan con Chrome local; los de ui-ux-pro-max leen archivos CSV/JSON locales. Se recomienda usar una sola como motor de estilo principal (taste-skill **o** ui-ux-pro-max) y las otras para auditar y pulir.
