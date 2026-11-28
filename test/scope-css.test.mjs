import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scopeCss } from "../src/scope-css.mjs";

const RC = ["embebido", "marco-poliplast"];
const one = (css) => scopeCss(css, { rootClasses: RC }).replace(/\s+/g, " ").trim();

test("encierra selectores comunes y pasa :root/html/body a la raíz", () => {
  assert.equal(one(".btn{a:1}"), ".ent-nativo .btn {a:1}");
  assert.equal(one(":root{--x:1}"), ".ent-nativo {--x:1}");
  assert.equal(one("html, body{margin:0}"), ".ent-nativo, .ent-nativo {margin:0}");
  assert.equal(one("*{box-sizing:border-box}"), ".ent-nativo *{box-sizing:border-box}".replace("*{", "* {"));
});

test("el tema del documento queda arriba de la raíz", () => {
  assert.equal(one(':root[data-theme="dark"] .x{c:1}'), ':root[data-theme="dark"] .ent-nativo .x {c:1}');
  assert.equal(one('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) a{c:1}}'), '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .ent-nativo a {c:1}}');
});

test("las clases que iban en <html> se suman a la raíz", () => {
  assert.equal(one(".embebido .layout{g:1}"), ".ent-nativo.embebido .layout {g:1}");
  assert.equal(one("html.marco-poliplast body{b:0}"), ".ent-nativo.marco-poliplast {b:0}");
  assert.equal(one("html:has(.pantalla) .sidebar{d:none}"), ".ent-nativo:has(.pantalla) .sidebar {d:none}");
});

test("keyframes, comentarios y textos con llaves no se rompen", () => {
  assert.equal(one("@keyframes s{from{a:0}to{a:1}}"), "@keyframes s{from{a:0}to{a:1}}");
  assert.equal(one('/* {x} */ .a::before{content:"{"}'), '.ent-nativo .a::before {content:"{"}');
});

test("toda la hoja de Entregas queda encerrada", () => {
  const css = readFileSync(new URL("../entregas/src/styles.css", import.meta.url), "utf8");
  const out = scopeCss(css, { rootClasses: RC });
  const selectors = [...out.matchAll(/(?:^|})\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((s) => !/^(from|to|\d+%)/.test(s));
  const loose = selectors.flatMap((s) => s.split(",")).map((s) => s.trim()).filter((s) => s && !s.includes(".ent-nativo"));
  assert.deepEqual(loose, []);
});
