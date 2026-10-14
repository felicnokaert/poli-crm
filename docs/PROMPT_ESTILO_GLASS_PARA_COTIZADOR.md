# Prompt: llevar el estilo del CRM Poliplast al cotizador

Pegalo tal cual en una sesión de Claude Code abierta en el repo del cotizador.

---

Quiero que le des al cotizador el mismo estilo visual "glass" con animaciones suaves que tiene mi CRM Poliplast. Es un cambio SOLO visual: no toques la lógica de cálculo, precios, datos ni la estructura de componentes. Primero leé el CSS y los componentes principales para entender cómo está armado; después aplicá el estilo con una capa de CSS global al final de la hoja de estilos (o un archivo nuevo importado al final), para que sea fácil de revertir.

Colores de marca (usá variables CSS en :root):
- --brand-red #ed1c24, --brand-red-dark #c9151c, --brand-charcoal #292929, --brand-gray #999b9e. Nada de verdes ni azules decorativos.

Estilo:
1. Paneles/tarjetas/modales: fondo blanco translúcido (rgba(255,255,255,.78)), backdrop-filter: blur(14px), borde 1px blanco translúcido, radio 14-16px, sombra suave (0 14px 40px rgba(41,41,41,.08)). Fondo de la página con un degradé muy sutil gris claro y un halo radial rojo apenas visible (opacidad ~10%) que se mueve lento.
2. Botón primario: degradé de --brand-red a --brand-red-dark, texto blanco, radio 10px, sombra roja suave; hover: sube 1px y se intensifica la sombra; active: vuelve. Botón secundario: vidrio claro con borde gris y hover rojo suave.
3. Animaciones: entrada de paneles con "glass-rise" (opacity 0→1, translateY 10px→0, .4s ease). Transiciones de .2s en hover/focus. Números de totales que suben de 0 al valor en ~700 ms al cargar (easing cúbico) — con cuidado de que el valor final mostrado sea siempre el real.
4. Inputs: fondo translúcido, foco con anillo rojo suave (box-shadow 0 0 0 3px rgba(237,28,36,.18)).
5. Tablas/listados: filas con hover translúcido, encabezado en --brand-charcoal sobre gris muy claro.
6. Accesibilidad: respetá prefers-reduced-motion (sin animaciones) y prefers-reduced-transparency / navegadores sin backdrop-filter (fondo sólido blanco). Mantené contraste de texto suficiente. Debe verse bien en celular.
7. Si el cotizador se imprime o exporta a PDF, el estilo glass NO debe afectar la salida: agregá @media print que deje fondo blanco, sin sombras ni blur ni animaciones.

Antes de terminar: corré los tests y el build si existen, verificá visualmente (captura con el navegador de Playwright si está disponible) la pantalla principal, un formulario y el resultado de una cotización, y mostrame antes/después. Hacé commits chicos y describí qué archivos tocaste.
