import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

test("'Importar tareas de Trello' aparece cuando App pasa onImportTasks (desde el 19/10 también a Felipe)", async () => {
  const { Tasks } = await loadJsxModule("src/Tasks.jsx");
  const base = { items: [], onToggle: () => {}, onOpen: () => {}, onNew: () => {} };
  assert.match(renderToStaticMarkup(React.createElement(Tasks, { ...base, personal: false, onImportTasks: () => {} })), /Importar tareas de Trello/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Tasks, { ...base, personal: true })), /Importar tareas de Trello/);
});

test("la memoria de precios muestra + IVA", async () => {
  const { default: PriceMemory } = await loadJsxModule("src/PriceMemory.jsx");
  const html = renderToStaticMarkup(React.createElement(PriceMemory, { sales: [] }));
  assert.match(html, /sin IVA/);
  assert.match(html, /USD 5,5 \+ IVA/);
});

test("el plan Trello de Felipe no viaja con Tareas ni Calendario", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["src/Tasks.jsx", "src/Calendar.jsx", "src/App.jsx"]) {
    const code = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /^import .*trello-plan\.mjs/m, file);
  }
});
