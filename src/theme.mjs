// Tema de la app: automático (sigue al dispositivo), claro u oscuro. Se guarda por navegador.
export const THEMES = ['auto', 'claro', 'oscuro'];
export const THEME_KEY = 'poliplast-theme';

export function nextTheme(current) {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] || 'auto';
}

export function readTheme(storage = globalThis.localStorage) {
  try { const value = storage?.getItem(THEME_KEY); return THEMES.includes(value) ? value : 'auto'; } catch { return 'auto'; }
}

export function applyTheme(theme, root = globalThis.document?.documentElement, storage = globalThis.localStorage) {
  if (root) {
    if (theme === 'claro') root.dataset.theme = 'light';
    else if (theme === 'oscuro') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
  }
  try { storage?.setItem(THEME_KEY, theme); } catch { /* sin almacenamiento */ }
}
