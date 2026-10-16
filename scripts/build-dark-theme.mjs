// Genera src/theme-dark.css: el modo oscuro. Toma cada regla de styles.css cuyo fondo es claro
// (blanco, hex claro o rgba blanco) y la repite con un fondo oscuro, más las variables de color.
// Uso: node scripts/build-dark-theme.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '');
const SURFACE = '#1c1c1f';
const SURFACE2 = '#26262a';
const lum = (hex) => { const h = hex.replace('#', ''); const f = h.length <= 4 ? h.slice(0, 3).split('').map((c) => c + c).join('') : h.slice(0, 6); const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

const rules = new Map(); // selector -> fondo oscuro (solo si el último fondo declarado es claro)
const last = new Map(); // selector -> último valor de fondo declarado
const colorRules = new Map(); // selector -> color claro para texto que en modo claro es oscuro
const blockRe = /([^{}@]+)\{([^{}]*)\}/g;
let m;
while ((m = blockRe.exec(css))) {
  const selectors = m[1].trim();
  if (!selectors || selectors.startsWith('from') || /^\d/.test(selectors) || selectors.includes('@')) continue;
  for (const decl of m[2].split(';')) {
    const cm = decl.match(/^\s*color\s*:\s*(#[0-9a-f]{3}|#[0-9a-f]{6})\s*$/i);
    if (cm) {
      const l = lum(cm[1]);
      for (const sel of selectors.split(',')) { if (l < 0.22) colorRules.set(sel.trim(), '#e7e7e9'); else if (l < 0.42) colorRules.set(sel.trim(), '#b4b5b9'); else colorRules.delete(sel.trim()); }
      continue;
    }
    const match = decl.match(/^\s*background(?:-color)?\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    const value = match[1];
    for (const sel of selectors.split(',')) last.set(sel.trim(), value);
    let target = null;
    if (/^(white|#fff|#ffffff|var\(--color-white\))$/i.test(value)) target = SURFACE;
    else if (/^rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(value)) target = SURFACE;
    else if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) && lum(value) > 0.8) target = lum(value) > 0.95 ? SURFACE : SURFACE2;
    else if (/^var\(--color-(input-bg|panel-bg|bg-soft|border-light)\)$/.test(value)) target = SURFACE2;
    for (const sel of selectors.split(',')) { if (target) rules.set(sel.trim(), target); else rules.delete(sel.trim()); }
  }
}

const vars = `
  color-scheme: dark;
  background: #121214;
  color: #e7e7e9;
  --color-forest: #f1f1f2;
  --color-input-bg: #1d1d20;
  --color-border-input: #3b3b41;
  --color-focus-border: #6b6b73;
  --color-border: #34343a;
  --color-border-alt: #34343a;
  --color-border-light: #2c2c31;
  --color-border-soft: #34343a;
  --color-border-warm: #34343a;
  --color-bg-soft: #26262a;
  --color-panel-bg: #1b1b1e;
  --color-text-muted: #a9aaae;
  --color-text-faint: #a3a4a8;
  --color-text-secondary: #b1b2b6;
  --color-text-body: #c4c5c8;
  --color-text-mid: #b4b5b9;
  --color-text-dark: #e2e2e4;
  --color-text-gray: #9d9ea2;
  --color-text-gray2: #9a9a9a;
  --color-green-text: #e2e2e4;
  --color-teal-brand: #d6d6d9;
  --color-teal-strong: #ececee;
  --color-teal-mid: #b4b5b9;
  --color-teal-dark: #ececee;
  --color-success: #6cc3a6;
  --color-success-bg: #17332b;
  --color-danger-strong: #e08a8a;
  --color-danger-text: #ee9a88;
  --color-danger-bg: #3a1f1c;
  --color-amber-dark: #e0b15a;
  --color-amber-text: #e6bf78;
  --color-amber-bg: #38301b;
  --color-terracotta: #d99a90;
  --color-blue-mid: #7fb0dd;
  --color-blue-cold: #1d2a35;`;

const surfaceRules = [...rules.entries()].map(([sel, bg]) => `${sel} { background: ${bg}; }`).concat([...colorRules.entries()].filter(([sel]) => !/^\.(primary|sidebar|brand)|sidebar|:disabled/.test(sel)).map(([sel, c]) => `${sel} { color: ${c}; }`)).join('\n');
const extras = `
body, .login-shell { background: #121214; }
.commercial-guidance, .prospect-glass::before { background: #1c1c1f; }
.segmented { background: #2a2a2e; }
.segmented button.selected { background: #3a3a40; color: #fff; }
.sidebar, .sidebar * { color-scheme: dark; }
.modal-backdrop { background: rgba(0,0,0,.6); }
main { color: #e7e7e9; }
a { color: #f0a0a4; }`;

const scoped = (prefix) => `${prefix}{${vars}}\n${surfaceRules.split('\n').map((r) => `${prefix} ${r}`).join('\n')}\n${extras.split('\n').map((r) => (r.trim() ? `${prefix} ${r}` : r)).join('\n')}`;
const out = `/* GENERADO por scripts/build-dark-theme.mjs — no editar a mano. */
${scoped(':root[data-theme="dark"]')}
@media (prefers-color-scheme: dark) {
${scoped(':root:not([data-theme="light"])').split('\n').map((l) => '  ' + l).join('\n')}
}
`;
writeFileSync('src/theme-dark.css', out);
console.log('reglas con fondo claro:', rules.size);
