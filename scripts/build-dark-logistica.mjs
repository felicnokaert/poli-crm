// Genera src/logistica/theme-dark.css: el modo oscuro de las pantallas de Logística (Dosificado, Conteo, Etiquetas).
// Misma regla que scripts/build-dark-theme.mjs (cada fondo claro → fondo oscuro, texto oscuro → claro), aplicada a sus
// hojas propias (que viven aparte de styles.css), más las variables y textos semitransparentes de esas pantallas.
// Uso: node scripts/build-dark-logistica.mjs   ·   --check (lo usa test/logistica-dark.test.mjs) falla si quedó viejo.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['src/logistica/dosificado.css', 'src/logistica/conteo.css', 'src/logistica/etiquetas.css'];
const OUT = 'src/logistica/theme-dark.css';
const SURFACE = '#1c1c1f';
const SURFACE2 = '#26262a';
const lum = (hex) => { const h = hex.replace('#', ''); const f = h.length <= 4 ? h.slice(0, 3).split('').map((c) => c + c).join('') : h.slice(0, 6); const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

const css = FILES.map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const rules = new Map();
const colorRules = new Map();
const borderRules = new Map();
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
    // Texto en negro semitransparente (rgba(0,0,0,a)) → claro con la misma intención (un poco más fuerte para que se lea).
    const rm = decl.match(/^\s*color\s*:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)\s*$/i);
    if (rm) { const a = Math.min(1, Number(rm[1]) + 0.25).toFixed(2); for (const sel of selectors.split(',')) colorRules.set(sel.trim(), `rgba(231,231,233,${a})`); continue; }
    const bm = decl.match(/^\s*border(?:-(?:top|bottom|left|right))?(?:-color)?\s*:\s*(.*)rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)(.*)$/i);
    if (bm) { for (const sel of selectors.split(',')) borderRules.set(sel.trim(), `border-color: rgba(255,255,255,${Math.min(0.3, Number(bm[2]) + 0.04).toFixed(2)})`); continue; }
    const match = decl.match(/^\s*background(?:-color)?\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    const value = match[1];
    let target = null;
    if (/^(white|#fff|#ffffff|var\(--color-white\))$/i.test(value)) target = SURFACE;
    else if (/^rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(value)) target = SURFACE;
    else if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) && lum(value) > 0.8) target = lum(value) > 0.95 ? SURFACE : SURFACE2;
    else if (/^var\(--(card|mist)\)$/.test(value)) target = SURFACE;
    for (const sel of selectors.split(',')) { if (target) rules.set(sel.trim(), target); else rules.delete(sel.trim()); }
  }
}

// Variables de las pantallas y textos que usan negro semitransparente (rgba(0,0,0,…)), que la regla de arriba no ve.
const extras = `
.logi-dosif, .logi-conteo { color: #e7e7e9; --ink: #e7e7e9; --graphite: #c4c5c8; --steel: #a9aaae; --line: #34343a; --mist: #26262a; --charcoal: #2a2a2e; --card: #1c1c1f; --bg: transparent; }
.logi-conteo .lead, .logi-conteo .label, .logi-conteo .kicker, .logi-conteo .count, .logi-conteo .depsub, .logi-conteo .cargando-txt, .logi-conteo .linksutil, .logi-conteo .sesionmeta, .logi-conteo .notaexport { color: #a9aaae; }
.logi-conteo .btnoff { background: #2a2a2e; color: #8d8e92; }
.logi-conteo .btnvolver, .logi-conteo .btnexport { background: #26262a; color: #e7e7e9; border-color: #3b3b41; }
.logi-dosif .dz-inp, .logi-dosif input, .logi-dosif select, .logi-conteo input, .logi-conteo select, .logi-conteo textarea { background: #1d1d20; color: #e7e7e9; border-color: #3b3b41; }
.logi-dosif .dz-table td { border-color: #2c2c31; }
.logi-dosif .dz-label, .logi-dosif .dz-muted, .logi-dosif .dz-desc { color: #a9aaae; }`;

const surfaceRules = [...rules.entries()].map(([sel, bg]) => `${sel} { background: ${bg}; }`)
  .concat([...colorRules.entries()].filter(([sel]) => !/\.on\b|chipon|depon|primary|btnmarca|btnverde|btnnaranja|btndark/.test(sel)).map(([sel, c]) => `${sel} { color: ${c}; }`))
  .concat([...borderRules.entries()].filter(([sel]) => !/\.on\b|chipon|depon/.test(sel)).map(([sel, b]) => `${sel} { ${b}; }`))
  .concat(extras.split('\n').filter((r) => r.trim()));
const scoped = (prefix) => surfaceRules.map((r) => { const open = r.indexOf('{'); return r.slice(0, open).split(',').map((x) => `${prefix} ${x.trim()}`).join(', ') + ' ' + r.slice(open); }).join('\n');
const out = `/* GENERADO por scripts/build-dark-logistica.mjs — no editar a mano. */
${scoped(':root[data-theme="dark"]')}
@media (prefers-color-scheme: dark) {
${scoped(':root:not([data-theme="light"])').split('\n').map((l) => '  ' + l).join('\n')}
}
`;
if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== out) { console.error(OUT + ' está viejo: correr node scripts/build-dark-logistica.mjs'); process.exit(1); }
  console.log('modo oscuro de Logística al día');
} else {
  writeFileSync(OUT, out);
  console.log('reglas de Logística:', rules.size, 'fondos,', colorRules.size, 'textos,', borderRules.size, 'bordes');
}
