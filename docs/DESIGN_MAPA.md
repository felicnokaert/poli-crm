# DESIGN.md — Mapa de cobertura de aplicadores (Grupo Poliplast)

> Un atlas de trabajo: claro, liviano y con nombres. Primero te orienta (¿dónde estoy?), después te deja decidir (¿dónde falta cobertura?). Nada decorativo que compita con el dato.

Estado: **PROPUESTA para aprobación** (no se escribió código). Alcance: `public/mapa/` (vista dentro del CRM y link compartible).
Prioridades acordadas con Felipe: **1) orientación, 2) velocidad**, 3) panel/celular, 4) marca.

---

## 0. Diagnóstico medido (de dónde partimos)

| Qué | Hoy | Dato |
|---|---|---|
| Límites IGN | 2 archivos GeoJSON, **137.000 puntos cada uno** | 2,7 MB crudos c/u |
| Transferencia real (producción, comprimido) | **~0,8 MB c/u** en 0,3 s | **La descarga NO es el cuello de botella** |
| Librerías cargadas siempre | MapLibre 193 KB + **xlsx 290 KB + turf 158 KB** (comprimidas) | xlsx solo sirve para exportar; turf solo para "Alcance" |
| Dónde se va el tiempo | Leer/armar 5,5 MB de geometría en el navegador y **volver a enviarla al mapa en cada cambio de parámetro** (`setData` de provincias + departamentos en `pintar()`) | Observado en pruebas: 10–25 s hasta poder usarlo |
| Orientación | Sin nombres de provincias, departamentos ni ciudades; fondo liso | Solo hay popups al tocar |
| Tipografía | Sistema (no DM Sans del CRM); colores propios saturados (4 clases + 6 tipos + 3 de alcance) | |

Nota honesta: los tiempos de 10–25 s se observaron en el navegador de pruebas (panel a veces oculto, sin caché). En tu equipo puede ser menos; por eso el objetivo se mide **antes y después con el mismo método** (ver §7).

---

## 1. Visual Theme & Atmosphere

**Style**: Cartografía clara de trabajo (en la línea de "Positron/Light"), con identidad Poliplast (rojo + grafito sobre blanco cálido).
**Keywords**: claro · legible · jerárquico · liviano · oficial · sobrio · cálido · "papel"
**Tone**: instrumento profesional de decisión — NOT dashboard recargado, NOT mapa de juguete, NOT neón.
**Feel**: un mapa impreso de ruta bien hecho: lo ves de lejos y entendés el país; te acercás y aparecen los nombres justos.

**Interaction Tier**: **L1 — precisión sobria** (hover/foco claros, transiciones cortas de zoom). Decisión deliberada: es una herramienta de lectura, no una landing; sin parallax, sin cursor custom, sin WebGL extra. (Las reglas de "efectos wow" de la guía de landing no aplican.)
**Dependencies**: CSS + MapLibre GL (CSP build, ya local). **Cero CDNs** (la CSP del CRM solo permite `'self'`).

---

## 2. Color Palette & Roles

```css
:root {
  /* Superficies (papel cálido) */
  --bg: #f6f5f2;            /* panel y fondo de página */
  --surface: #ffffff;       /* tarjetas, popups */
  --surface-alt: #efede8;   /* filas alternas, chips */
  --surface-hover: #e9e6df;

  /* Bordes */
  --border: #e2dfd8;
  --border-hover: #cfcac0;

  /* Texto */
  --text: #1c1c1c;          /* = --color-forest del CRM */
  --text-secondary: #55565a;
  --text-tertiary: #8a8a8e;

  /* Acento = rojo Poliplast (acciones, foco, selección) */
  --accent: #ed1c24;        /* = --brand-red del CRM */
  --accent-hover: #c9151c;
  --accent-rgb: 237, 28, 36;
  --bg-rgb: 246, 245, 242;

  /* Mapa base */
  --mar: #e6edf1;           /* fuera del país */
  --tierra: #fbfaf8;        /* provincias sin dato */
  --limite: #cfcac0;        /* borde provincia */
  --limite-fino: #e2dfd8;   /* borde departamento */
  --halo: #ffffff;          /* halo de las etiquetas */
  --etiqueta-prov: #7a766c;
  --etiqueta-ciudad: #3b3a36;

  /* Semáforo de zonas (apagado: deja leer las etiquetas) */
  --zona-faltan: #f2b3b0;   /* falta cobertura  */
  --zona-ok: #bfdcc8;       /* equilibrada      */
  --zona-sobre: #b7cde6;    /* sobresaturada    */
  --zona-sin: #e6e3dc;      /* sin clientes     */

  /* Alcance por ciudades (lo que hay que encontrar = lo más saturado) */
  --cob-sin: #ed1c24;       /* sin aplicador al alcance */
  --cob-uno: #f0a30a;       /* 1 aplicador               */
  --cob-varios: #2f8f5b;    /* 2 o más                   */
  --cob-zona: #2f8f5b;      /* relleno de la zona (opacidad .16) */

  /* Tipos de cliente (pines) — se mantienen los actuales, ya conocidos */
  --tipo-aplicador: #6d3fd6;
  --tipo-inyeccion: #0b8f9c;
  --tipo-fabricante: #c2185b;
  --tipo-no-aplica: #8a6d3b;
  --tipo-otro: #5d6b7a;
  --tipo-sin: #9aa5b1;
  --pin-inactivo: #b3bcc6;

  /* Semánticos */
  --success: #2f8f5b;
  --error: #c9151c;
  --warning: #b97800;
}
```

**Color Rules**
- Todo color sale de una variable; en JS del mapa se leen con `getComputedStyle` **una vez** al iniciar (cero hex sueltos en `app.js`).
- **El rojo Poliplast tiene dos usos y solo dos:** acciones/foco/selección de la interfaz y "ciudad sin cobertura" en el modo Alcance. En el mapa nunca hay otro elemento grande en rojo.
- Las zonas de semáforo van **apagadas** (tonos pastel) para que las etiquetas se lean encima; el color fuerte queda para pines y ciudades.
- No comunicar nada solo por color: los estados llevan texto en leyenda, tooltip y ranking (accesibilidad daltónica rojo/verde).
- Contraste: texto sobre fondo ≥ 4.5:1; etiquetas del mapa llevan halo blanco para sostener el contraste sobre cualquier zona.

---

## 3. Typography Rules

**Interfaz (panel, tarjetas, popups)** — la misma familia del CRM, **autoalojada** (la CSP de `/mapa` solo permite `font-src 'self'`):

```css
@font-face {
  font-family: 'DM Sans';
  src: url('fonts/dm-sans-latin-wght-normal.woff2') format('woff2');
  font-weight: 100 1000;
  font-style: normal;
  font-display: swap;            /* texto visible al instante con la fuente del sistema */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
:root { --font-ui: 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
```
Archivo verificado: `@fontsource-variable/dm-sans`, subconjunto latin, **36,9 KB** (cubre ñ, tildes, ü).

**Etiquetas del mapa (glifos vectoriales, locales)** — Noto Sans en `public/mapa/fonts/` (rangos 0-255, cubren el castellano): Regular (ya está, 76 KB), **Bold** (verificado disponible, 81 KB) e **Italic** (80 KB, para accidentes/ríos si se suman).

| Rol | Fuente | Tamaño | Peso | Espaciado | Notas |
|---|---|---|---|---|---|
| Título del panel | DM Sans | 18 px | 700 | -0.01em | Una sola vez, arriba |
| Subtítulo / fecha de datos | DM Sans | 12.5 px | 400 | — | `--text-tertiary` |
| Sección (h2 del panel) | DM Sans | 11 px | 700 | .06em | MAYÚSCULAS, `--text-tertiary` |
| Cifra clave (KPI) | DM Sans | 26 px | 700 | -0.02em | números tabulares |
| Cuerpo / filas | DM Sans | 13 px | 400 | — | line-height 1.45 |
| Etiqueta de **provincia** (mapa) | Noto Sans Bold | 11→15 px según zoom | 700 | .14em | MAYÚSCULAS, `--etiqueta-prov` |
| Etiqueta de **departamento** (mapa) | Noto Sans Regular | 10→12 px | 400 | .02em | `--etiqueta-prov` |
| Etiqueta de **ciudad** (mapa) | Noto Sans Regular (Bold en >300 k hab.) | 10→14 px | 400/700 | — | `--etiqueta-ciudad`, halo 1.6 px |

**Typography Rules**
- Números siempre con `font-variant-numeric: tabular-nums` y formato `es-AR` (separador de miles con punto).
- **NEVER use**: fuentes remotas (Google Fonts, CDNs), más de 2 familias en la interfaz, MAYÚSCULAS en bloques de texto largos, texto de mapa menor a 10 px.
- Text Decoration: sin gradientes ni sombras en texto (herramienta de datos). Solo halo blanco en etiquetas del mapa.

---

## 4. Component Stylings

### Botones
```css
.btn { font: 600 13px var(--font-ui); min-height: 36px; padding: 0 14px; border-radius: 9px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer;
  transition: background .12s ease, border-color .12s ease, box-shadow .12s ease; }
.btn:hover { background: var(--surface-hover); border-color: var(--border-hover); }
.btn:active { background: var(--surface-alt); transform: translateY(1px); }
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn--primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
```

### Tarjetas de cifras (KPI)
```css
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
.kpi:hover { border-color: var(--border-hover); }
.kpi__valor { font: 700 26px var(--font-ui); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.kpi__rotulo { font: 400 12px var(--font-ui); color: var(--text-secondary); }
.kpi--alerta .kpi__valor { color: var(--accent); }   /* p. ej. "habitantes sin cobertura" */
```

### Navegación del panel (pestañas)
```css
.tabs { display: flex; gap: 4px; background: var(--surface-alt); padding: 3px; border-radius: 10px; }
.tab { flex: 1; min-height: 34px; border: 0; background: transparent; border-radius: 8px; font: 600 12.5px var(--font-ui); color: var(--text-secondary); cursor: pointer; }
.tab:hover { background: var(--surface-hover); }
.tab[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.tab:focus-visible { outline: 3px solid var(--accent); outline-offset: 1px; }
```
Pestañas: **Vista** (nivel, radio, pines) · **Filtros** · **Resultados** (ranking y cifras).

### Chip "¿Dónde estoy?" (orientación)
```css
.donde { position: absolute; top: 12px; left: 12px; max-width: min(70vw, 420px); background: rgba(var(--bg-rgb), .94);
  border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; font: 500 12.5px var(--font-ui); color: var(--text);
  pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.donde b { font-weight: 700; }
```
Muestra, según el centro del mapa: `Argentina › Buenos Aires › General Pueyrredón` (se actualiza al terminar de mover, no durante).

### Leyenda flotante
```css
.leyenda { position: absolute; left: 12px; bottom: 28px; background: rgba(255,255,255,.94); border: 1px solid var(--border);
  border-radius: 12px; padding: 10px 12px; font: 400 12px var(--font-ui); box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.leyenda[hidden] { display: none; }
.leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
```

### Popup / ficha de cliente y de ciudad
```css
.maplibregl-popup-content { border-radius: 12px; padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.14); font: 400 13px var(--font-ui); }
.estado { display: inline-block; padding: 2px 8px; border-radius: 999px; font: 600 11px var(--font-ui); color: #fff; }
```

### Estado de carga
```css
.cargando { position: absolute; inset: 0; display: grid; place-items: center; background: var(--mar); z-index: 5; transition: opacity .2s ease; }
.cargando[data-listo="true"] { opacity: 0; pointer-events: none; }
.cargando__paso { font: 500 13px var(--font-ui); color: var(--text-secondary); }   /* "Cargando provincias… 1 de 3" */
```

---

## 5. Layout Principles

**Contenedor**: pantalla completa del iframe; panel izquierdo de **320 px** (el ancho actual se mantiene; cambia cómo se organiza por dentro) + mapa que ocupa el resto. Máximo 1 panel abierto.
**Espaciado (escala 4 px)**: 4 · 8 · 12 · 16 · 24. Padding de tarjeta 12–14; separación entre tarjetas 8; secciones del panel 16.
**Grilla del panel**: tarjetas de cifras en 2 columnas (`grid-template-columns: 1fr 1fr; gap: 8px`).
**Jerarquía del panel (de arriba hacia abajo)**: título + fecha → **2 cifras clave** (% de población cubierta, ciudades sin cobertura) → pestañas → contenido de la pestaña.
**Controles del mapa**: zoom y "ver todo el país" arriba a la derecha; escala métrica abajo a la izquierda (debajo de la leyenda); chip "¿Dónde estoy?" arriba a la izquierda.

---

## 6. Depth & Elevation

| Nivel | Tratamiento | Uso |
|---|---|---|
| Plano | sin sombra, borde `--border` | mapa, panel, filas |
| Sutil | `0 1px 2px rgba(0,0,0,.08)` | pestaña activa, chips |
| Elevado | `0 2px 8px rgba(0,0,0,.08)` | leyenda, botones flotantes |
| Superpuesto | `0 8px 24px rgba(0,0,0,.14)` | popups, hoja inferior en celular |

---

## 7. Orientación y velocidad (el corazón de esta propuesta)

### 7.1 ORIENTACIÓN — nombres según el zoom (sin servicios de terceros)

Los nombres salen de **datos propios**: `ciudades.json` (2.277 localidades con población, ya en el sitio) y un archivo chico nuevo `etiquetas.json` (24 provincias + 514 departamentos con un punto garantizado dentro de cada polígono, ~40 KB). Tipografía: glifos locales (Noto Sans Regular/Bold). MapLibre resuelve las colisiones solo (`text-allow-overlap: false`) y prioriza por población (`symbol-sort-key`).

| Zoom | Se ve | Se oculta |
|---|---|---|
| < 4.6 (país) | **PROVINCIAS** (24, mayúsculas espaciadas) + ciudades > 1 M hab. | departamentos |
| 4.6 – 6 | provincias + ciudades > 300 k | |
| 6 – 7 | ciudades > 100 k; provincias se desvanecen (opacidad 1→0) | provincias |
| 7 – 9 | **departamentos** (nombres) + ciudades > 30 k (a z 8.5: > 10 k) | |
| 9 – 10.5 | ciudades > 2 k | etiquetas de departamento |
| ≥ 10.5 | **todas** las ciudades | |

Reglas de legibilidad: halo blanco 1.6 px; las etiquetas **nunca tapan un pin** (los pines van arriba y las etiquetas se corren); aparecen/desaparecen con fundido de 150 ms (nunca saltan).
Refuerzos de orientación (baratos y de alto valor): **chip "¿Dónde estoy?"** (§4), **barra de escala**, botón **"Ver todo el país"**, y al elegir una provincia en el filtro el mapa vuela hasta ella.
*Fuera de alcance por ahora:* rutas/ríos/calles. Requerirían un mapa base propio (p. ej. un recorte de OpenStreetMap autoalojado, varios cientos de MB) o un proveedor externo (hoy bloqueado por la CSP). Si más adelante hace falta, es una ronda aparte con tu OK.

### 7.2 VELOCIDAD — presupuesto y medidas

**Objetivos (se verifican con la misma prueba antes y después)**: mapa **usable en ≤ 3 s con caché** y **≤ 4 s en frío** (red de oficina); transferencia inicial **≤ 700 KB comprimidos**; ningún cálculo de interfaz > 300 ms.

| # | Medida | Resultado esperado (verificado en prueba) |
|---|---|---|
| 1 | **Simplificar los límites** con `mapshaper` (simplificación que respeta las fronteras compartidas): provincias **8 %**, departamentos **12 %**; coordenadas con 4 decimales (~11 m) | Provincias 2,7 MB → ~**230 KB** (137.000 → ~12.000 puntos). Departamentos 2,7 MB → **457 KB** (137.000 → ~20.700 puntos). Comprimidos: ~**45 KB y ~80 KB** |
| 2 | **Quitar propiedades sobrantes** y precalcular el identificador de zona (hoy se recorre cada feature en el navegador) | Menos trabajo al arrancar |
| 3 | **Cargar en orden y a pedido**: primero provincias + etiquetas (pintan la pantalla); departamentos en un momento libre del navegador (o al acercarse); `turf` solo al abrir "Alcance"; `xlsx` solo al exportar (y nunca en el link público) | −450 KB comprimidos del arranque |
| 4 | **No reenviar la geometría en cada cambio**: los colores de zona pasan a `feature-state` (se cambia solo el estado de 24 + 514 zonas) en lugar de `setData` de 5,5 MB | Cambiar radio/filtros pasa de segundos a milisegundos |
| 5 | **Zona de alcance**: calcular la unión de círculos fuera del hilo principal (Web Worker local) o con un método que no se acumule | Recalcular < 300 ms con ~300 aplicadores |
| 6 | **Caché del navegador**: archivos de `data/`, `vendor/` y `fonts/` con nombre versionado y `Cache-Control: public, max-age=31536000, immutable` | Segunda visita casi instantánea |
| 7 | **Pantalla de carga con pasos** ("Cargando provincias… 1 de 3") y esqueleto del panel | La espera se entiende; nunca un mapa gris mudo |
| 8 | **Medición**: `performance.mark` + modo `?perf=1` que muestra tiempos | Para comprobar los objetivos con números |

Nota técnica verificada: al simplificar departamentos quedan ~51 cruces de bordes **que ya existen en los datos originales del IGN** (no los causa el recorte; el número no cambia entre 4 % y 16 %). No afectan lo que se ve.

El **link compartido** usa exactamente los mismos archivos y reglas: la foto se pide **en paralelo** con la geometría; `/api/mapa-publico` sigue sin caché (para que "Dejar de compartir" valga al instante).

---

## 8. Animation & Interaction

**Motion Philosophy**: transiciones cortas y funcionales (≤ 200 ms), solo `opacity` y `transform`; nada que distraiga del dato.
**Tier**: L1.

```css
.btn, .tab, .kpi { transition: background .12s ease, border-color .12s ease, box-shadow .12s ease; }
.leyenda, .donde { animation: aparece .18s ease both; }
@keyframes aparece { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
```
- **Zoom**: etiquetas con fundido (`text-opacity` interpolado por zoom); la capa de provincias → departamentos se cruza con un fundido de ~0,6 niveles de zoom en vez del salto actual (`ZOOM_DEPTOS = 5.6`).
- **Hover** (escritorio): zona resaltada con contorno `--text` 2 px + tooltip; ciudad: cursor `pointer` y anillo `--accent`.
- **Foco** (teclado): contorno rojo 3 px en todo control; el mapa se puede enfocar y mover con flechas/`+`/`-` (MapLibre).
- **Tocar** (celular): primer toque abre la ficha; no hay hover.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```
(y en el mapa: `fadeDuration: 0`, vuelos con `animate: false`).

---

## 9. Do's and Don'ts

### Do
- Leer los colores de variables CSS; un solo lugar para ajustar la identidad.
- Mostrar **nombres** primero y dato después; la pregunta "¿dónde estoy?" siempre tiene respuesta en pantalla.
- Cargar lo mínimo para pintar algo útil y traer el resto en segundo plano.
- Mantener las etiquetas con halo blanco y colisiones resueltas.
- Probar siempre el **link compartido** (ventana privada) además de la vista del CRM.
- Medir antes y después con la misma prueba y mostrar los números.
- Conservar el comportamiento de privacidad actual (la foto pública nunca trae CUIT, teléfonos ni emails).

### Don't
- ❌ **No** cargar nada desde CDNs ni dominios externos (Google Fonts, unpkg, mapas base de terceros): la CSP lo bloquea y además filtra datos de uso.
- ❌ **No** usar el rojo Poliplast como relleno de zonas grandes.
- ❌ **No** comunicar un estado solo por color.
- ❌ **No** reenviar los 5,5 MB de geometría al mapa por cada cambio de filtro.
- ❌ **No** poner etiquetas de ciudades sin control de colisión (se pisan y ensucian).
- ❌ **No** agregar animaciones decorativas (parallax, rebotes, partículas): es una herramienta de lectura.
- ❌ **No** usar `filter: blur` ni sombras pesadas sobre el mapa en movimiento.
- ❌ **No** dejar controles que no hacen nada en la vista pública (revisión de clasificación, exportar).
- ❌ **No** esconder la leyenda detrás de un menú: tiene que verse con el mapa.

---

## 10. Responsive Behavior

| Nombre | Ancho | Cambios clave |
|---|---|---|
| Escritorio | > 900 px | Panel fijo de 320 px a la izquierda; leyenda y chip sobre el mapa |
| Tablet | 600–900 px | Panel de 280 px, colapsable con botón; cifras en 2 columnas |
| Celular | < 600 px | **El mapa ocupa toda la pantalla**; el panel pasa a **hoja inferior** (arrastrable, 3 alturas: cerrada / cifras / completa); leyenda compacta que se abre con un toque; chip "¿Dónde estoy?" de una línea |

**Touch targets**: mínimo **44 × 44 px** (hoy los campos y botones del panel miden ~30 px de alto). **Colapso**: en celular las pestañas conservan su orden (Vista · Filtros · Resultados) y el ranking pasa a tarjetas; la tabla "Revisar clasificación" (solo CRM) se muestra como lista apilada.

```css
@media (max-width: 900px) { #app { grid-template-columns: 1fr; } #panel { position: absolute; z-index: 6; width: min(320px, 86vw); } }
@media (max-width: 600px) {
  #panel { inset: auto 0 0 0; width: auto; max-height: 78vh; border-radius: 16px 16px 0 0; box-shadow: 0 -8px 24px rgba(0,0,0,.14); }
  .btn, .tab { min-height: 44px; }
}
```

---

## 11. Plan de implementación (cada ronda: worktree aislado, tests + build + prueba en navegador, mide antes/después)

| Ronda | Qué | Archivos principales | Criterio de aceptación |
|---|---|---|---|
| **A. Velocidad** | Medidas 1–8 de §7.2 | `scripts/build-mapa-data.mjs` (nuevo, genera los límites livianos), `public/mapa/data/*`, `public/mapa/app.js`, `vercel.json` (caché) | Mapa usable ≤ 3 s con caché / ≤ 4 s en frío; arranque ≤ 700 KB; cambiar radio/filtros < 300 ms; link público idéntico |
| **B. Orientación** | §7.1 completo + tipografía local + paleta | `public/mapa/etiquetas.json`, `public/mapa/fonts/*`, `app.js`, `styles.css` | Con zoom país se leen las 24 provincias; al acercarse aparecen departamentos y ciudades sin pisarse; el chip responde siempre |
| **C. Panel y celular** | Pestañas, cifras clave, leyenda flotante, hoja inferior | `index.html`, `styles.css`, `app.js` | Se usa cómodo en celular; controles ≥ 44 px; sin desborde horizontal |

Cada ronda se publica sola (nada queda a medias), y el link ya compartido sigue funcionando.

---

## 12. Decisiones que necesito de vos para pasar a código

1. **Rojo Poliplast como acento** y paleta de papel cálido/grafito (§2): ¿te cierra o preferís otro tono?
2. **Simplificación de límites** (bordes ligeramente más angulares a zoom muy alto): ¿aceptable? (A nivel provincia y departamento es imperceptible.)
3. **Orden**: ¿A (velocidad) → B (orientación) → C (panel)? Siendo tus prioridades orientación y velocidad, podría hacer A y B juntas en una sola ronda si preferís verlo todo junto.
4. **Mapa base con rutas/calles**: queda afuera por ahora (§7.1). ¿Lo dejamos para más adelante?
