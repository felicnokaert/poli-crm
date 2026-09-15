# DESIGN.md — Poliplast CRM, dirección "A" (marca real)

Spec de diseño para migrar el CRM del esquema verde/teal actual (sin relación
con la marca) a la identidad real de Grupo Poliplast: rojo/gris/grafito del
isologo, look industrial B2B de alto contraste. Este documento es la fuente
de verdad para todas las rondas de UI que sigan — se actualiza a mano si el
criterio cambia, no se re-negocia en cada ronda.

## 1. Paleta de color

**Base de marca (ya existe en `--brand-*`, se mantiene):**
- `--brand-red: #ed1c24` — acción primaria, alertas, foco, badges de "requiere atención"
- `--brand-red-dark: #c9151c` — hover de rojo
- `--brand-charcoal: #292929` — fondos oscuros estructurales (sidebar, headers de card)
- `--brand-gray: #999b9e` — texto secundario sobre fondo oscuro, bordes sutiles

**Neutros nuevos (reemplazan la escala verde/teal `--color-forest`, `--color-teal-*`, `--color-green-text`, etc.):**
- `--color-ink: #1c1c1c` — texto principal
- `--color-graphite: #4a4a4a` — texto secundario
- `--color-steel: #6f7275` — texto terciario / metadatos
- `--color-mist: #f1f1f2` — fondos de fila/hover neutros
- `--color-line: #dcdcde` — bordes por defecto
- `--color-panel: #ffffff` — fondo de card/panel
- `--color-page: #f5f5f6` — fondo de página (ya existe, se mantiene)

**Estados semánticos (se mantienen conceptualmente, se re-tintan a neutro+rojo en vez de verde/ámbar/azul difuso):**
- Éxito → gris oscuro + ícono, no verde (el verde no es de marca; reservar el verde solo si el dato es literalmente "plata"/ingresos, a definir caso por caso)
- Alerta/atención → rojo de marca, dos intensidades: `--color-danger-bg: #fbe7e3` / `--color-danger-text: #a34848` (ya existen, se mantienen)
- Advertencia media (tibio, prioridad media) → ámbar se mantiene igual que hoy (`--color-amber-*`), es neutro respecto a la marca y ya funciona bien
- Info fría (frío/baja prioridad) → azul se mantiene igual que hoy (`--color-blue-*`), mismo motivo

**Regla de uso:** el rojo es la señal de "esto importa ahora" (badges, contadores de pendientes, alertas de cron, botón primario). Nunca usarlo como color decorativo de fondo grande — eso lo satura y le hace perder peso semántico.

## 2. Tipografía

Se mantiene sin cambios: **DM Sans** (texto de cuerpo, ya cargada) + **Manrope** (headings, ya cargada). No hay razón de marca para cambiarla — es limpia y funciona en ambos ejes.

- H1 (topbar): Manrope 800, 28px, `--color-ink`
- H2 (panel-head): Manrope 700, 16px
- Body: DM Sans 400, 14px, `--color-ink` / `--color-graphite`
- Metadatos/labels: DM Sans 700, 11-12px, uppercase opcional, `--color-steel`

## 3. Componentes clave

- **Sidebar:** fondo `--brand-charcoal` (ya es así, `#242424` ≈ ok, unificar al token). Item activo: barra lateral roja (`box-shadow: inset 3px 0 0 var(--brand-red)`, ya existe) — se mantiene, es el patrón correcto de marca.
- **Metric card (Dashboard):** fondo `--color-panel`, borde `--color-line`, número grande en `--color-ink` (no charcoal verdoso). El acento rojo se reserva para el valor cuando el métrico representa algo pendiente/urgente (ej. "Por revisar"), gris/ink cuando es neutro (ej. "Tareas totales").
- **Botón primario:** ya usa `--brand-red` — se mantiene sin cambios, es correcto.
- **Botón secundario:** gris neutro (`--color-mist` fondo, `--color-graphite` texto) — hoy ya es así, se mantiene.
- **Pills de estado (temp, priority, stage):** mantener ámbar/azul para frío/tibio/media/baja (no son de marca, son semáforo universal), pasar "caliente"/"alta" a rojo de marca en vez del rojo genérico actual (ya casi coincide, unificar el hex exacto).
- **Badges de navegación (`nav-badge`, contador de pendientes):** ya usan `--brand-red` — correcto, se mantiene.

## 4. Layout

Sin cambios estructurales: sidebar fijo 238px + contenido fluido, grid de métricas responsive (5→3→2 columnas), modales centrados. El rework es de color/tono, no de arquitectura — reduce riesgo y trabajo.

## 5. Motion

Mínimo, ya existente: transición de 120-150ms en hovers y el caret de navegación. No agregar animación decorativa — es una herramienta de trabajo diario, no un sitio de marketing.

## 6. Depth (sombras/elevación)

Mantener sombras suaves y bajas ya en uso (`box-shadow: 0 3px 10px #143a3010` tipo) pero neutralizar el tinte verdoso de esas sombras (`#143a30` → usar `#00000012` o similar neutro). Modales: mantener el overlay oscuro pero neutro, no verde (`#102f2970` → `#1c1c1c70`).

## 7. Do's / Don'ts

- **Do** usar rojo para: alertas, badges de pendientes, botón primario, foco de inputs (ya así).
- **Do** dejar la mayoría de la UI en neutros (blanco/gris/ink) — el rojo debe ser minoría visual.
- **Don't** pintar fondos grandes de rojo (headers de card, franjas completas) — cansa y pierde jerarquía.
- **Don't** reintroducir verde/teal salvo que el dato sea literalmente monetario positivo (a evaluar puntualmente, no por defecto).
- **Don't** tocar arquitectura de componentes/layout en esta ronda — es un rework de tokens de color y tipografía puntual, no un rediseño funcional.

## 8. Responsividad

Sin cambios respecto a los breakpoints actuales (1100px, 850px, 760px, 700px) — ya están afinados y probados. Solo cambian los colores dentro de esas reglas.

## 9. Accesibilidad (AA)

Mantener el estándar ya aplicado en la ronda de contraste de 14/09 (`--color-text-muted`/`--color-text-faint` oscurecidos a ~4.5:1). Cualquier neutro nuevo (`--color-ink`, `--color-graphite`, `--color-steel`) debe verificarse a ≥4.5:1 sobre `--color-page`/`--color-panel` antes de mergear. El rojo de marca sobre blanco ya cumple (usado hace tiempo en botones).

## Plan de implementación (rondas chicas, mismo workflow de siempre)

No se hace de una vez — cada ronda es un worktree aislado, tests+build+verificación visual antes de mergear:

1. **Ronda 1 — Tokens base:** reemplazar la escala `--color-forest/--color-teal-*/--color-green-text/...` por los neutros nuevos de esta spec en `:root`, sin tocar componentes todavía. Correr toda la app y verificar visualmente que nada rompe (esto solo cambia valores de variables ya usadas).
2. **Ronda 2 — Dashboard (Inicio):** ajustar metric cards, automation note, panels a la nueva paleta — es la pantalla más usada, referencia visual para el resto.
3. **Ronda 3+ — resto de pantallas** (Pipeline, Ventas, Tareas, Base técnica, etc.), una o dos por ronda, priorizando las de uso diario.

Este archivo se actualiza si en el camino aparece un criterio nuevo — no se vuelve a preguntar lo ya decidido acá.
