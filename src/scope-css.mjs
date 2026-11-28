// Poliplast App (28/11, Felipe: «una sola app, no una adentro de otra»): los módulos que nacieron como apps aparte
// (Entregas, la app de conteo…) se muestran como pantallas nativas. Su hoja de estilos fue escrita para ser la página entera
// (:root, html, body, .btn…): acá se encierra todo debajo de una clase (`.ent-nativo`) para que no toque al resto de la app.
//
// Reglas:
// - `:root`, `html`, `body` → la clase raíz. Si llevan condiciones del documento (`:root[data-theme="dark"]`,
//   `:root:not([data-theme="light"])`), quedan arriba: `:root[data-theme="dark"] .ent-nativo …`.
// - `html.x` / `.x` cuando `x` es una clase que la app ponía en <html> (embebido, marco-poliplast…) → `.ent-nativo.x`.
// - `html:has(…)` → `.ent-nativo:has(…)`.
// - Todo lo demás → `.ent-nativo <selector>`.
// - @media/@supports/@container/@layer se recorren; @keyframes, @font-face, @property e @import quedan como están.

const RECURSE_AT = /^@(media|supports|container|layer|scope|document)\b/i;

function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === "\\") i += 1; else if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Primer compuesto del selector (hasta el primer combinador fuera de paréntesis) y el resto. */
function firstCompound(selector) {
  let depth = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(ch)) return [selector.slice(0, i), selector.slice(i)];
  }
  return [selector, ""];
}

function scopeSelector(raw, root, rootClasses) {
  const sel = raw.trim();
  if (!sel) return sel;
  let [head, rest] = firstCompound(sel);
  const docMatch = head.match(/^(:root|html)(.*)$/i);
  let docCond = "";
  let merged = "";
  if (docMatch) {
    const tail = docMatch[2];
    // Clases propias de <html> (html.marco-poliplast) y :has() se pasan a la raíz; lo demás ([data-theme], :not) es del documento.
    const pieces = tail.match(/(\.[\w-]+|:has\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\]|:not\((?:[^()]|\([^()]*\))*\)|::?[\w-]+(?:\([^)]*\))?)/g) || [];
    for (const piece of pieces) {
      if (piece.startsWith(".") || piece.startsWith(":has(")) merged += piece;
      else docCond += piece;
    }
    [head, rest] = firstCompound(rest.trim());
    if (!head) {
      return docCond ? `:root${docCond} ${root}${merged}` : `${root}${merged}`;
    }
  }
  // `body` justo después (o solo) es la misma raíz.
  if (/^body\b/i.test(head)) {
    merged += head.slice(4);
    [head, rest] = firstCompound(rest.trim());
  } else {
    const cls = head.match(/^\.([\w-]+)/);
    if (cls && rootClasses.includes(cls[1])) {
      merged += head;
      [head, rest] = firstCompound(rest.trim());
      if (/^body\b/i.test(head)) { merged += head.slice(4); [head, rest] = firstCompound(rest.trim()); }
    }
  }
  const prefix = `${docCond ? `:root${docCond} ` : ""}${root}${merged}`;
  if (!head) return prefix;
  if (head === "*" && !rest && !merged) return `${prefix} *`;
  return `${prefix} ${head}${rest}`.replace(/\s+/g, " ").trim();
}

function findBlockEnd(css, open) {
  let depth = 0;
  let quote = "";
  for (let i = open; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) { if (ch === "\\") i += 1; else if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "/" && css[i + 1] === "*") { const end = css.indexOf("*/", i + 2); i = end < 0 ? css.length : end + 1; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth === 0) return i; }
  }
  return css.length - 1;
}

function scopeBlock(css, root, rootClasses) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (open < 0) { out += css.slice(i); break; }
    // @import/@charset sueltos (terminan en ; antes de una llave)
    if (semi >= 0 && semi < open && /^\s*@/.test(css.slice(i, semi))) { out += css.slice(i, semi + 1); i = semi + 1; continue; }
    const prelude = css.slice(i, open);
    const end = findBlockEnd(css, open);
    const body = css.slice(open + 1, end);
    const head = prelude.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (head.startsWith("@")) {
      out += RECURSE_AT.test(head) ? `${prelude}{${scopeBlock(body, root, rootClasses)}}` : `${prelude}{${body}}`;
    } else {
      const lead = prelude.match(/^\s*/)[0];
      const comments = (prelude.match(/\/\*[\s\S]*?\*\//g) || []).join("");
      const scoped = splitTopLevel(head, ",").map((s) => scopeSelector(s, root, rootClasses)).join(", ");
      out += `${lead}${comments}${scoped} {${body}}`;
    }
    i = end + 1;
  }
  return out;
}

/** Encierra una hoja de estilos de página entera debajo de `root` (por ejemplo `.ent-nativo`). */
export function scopeCss(css, { root = ".ent-nativo", rootClasses = [] } = {}) {
  return scopeBlock(String(css || "").replace(/\/\*[\s\S]*?\*\//g, ""), root, rootClasses);
}
