// Qué parte de un iframe de alto completo se ve en pantalla, en coordenadas del iframe (Entregas en el CRM).
// rect: getBoundingClientRect del iframe. topBar: la barra de arriba fija del CRM en el celular (si tapa);
// bottomBar: la barra de abajo del celular. Devuelve { top, alto } en px enteros (alto 0 si no se ve nada).
export function visibleSlice({ rect, viewportHeight, viewportWidth = Infinity, topBar = null, bottomBar = null }) {
  let screenTop = 0;
  let screenBottom = viewportHeight;
  // Solo cuenta como tapa una barra horizontal de arriba (la del celular), no la columna lateral de la compu.
  if (topBar && topBar.width >= viewportWidth * 0.9 && topBar.top <= 0 + 1) screenTop = Math.max(screenTop, topBar.bottom);
  if (bottomBar && bottomBar.height > 0) screenBottom = Math.min(screenBottom, bottomBar.top);
  const from = Math.max(rect.top, screenTop);
  const to = Math.min(rect.bottom, screenBottom);
  const top = Math.max(0, Math.round(from - rect.top));
  const alto = Math.max(0, Math.round(to - from));
  return { top, alto };
}

// 21/11: el tema que ve la persona en el CRM (Más → Perfil: automático, claro u oscuro) para pasárselo a Entregas y al cotizador.
export function resolvedTheme(root = globalThis.document?.documentElement, win = globalThis.window) {
  const chosen = root?.dataset?.theme;
  if (chosen === 'dark' || chosen === 'light') return chosen;
  try { return win?.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function withTheme(src, theme) {
  try {
    const url = new URL(src);
    url.searchParams.set('tema', theme);
    return url.toString();
  } catch { return src; }
}
