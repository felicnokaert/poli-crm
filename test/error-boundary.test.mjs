import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

test("un error en una pantalla no deja la app en blanco: muestra el aviso con reintentar", async () => {
  const { ErrorBoundary } = await loadJsxModule("src/ErrorBoundary.jsx");
  const Rota = () => { throw new Error("objeto como texto"); };
  const original = console.error; console.error = () => {};
  try {
    render(React.createElement("div", null,
      React.createElement("nav", null, "Menú"),
      React.createElement(ErrorBoundary, null, React.createElement(Rota))));
  } finally { console.error = original; }
  assert.ok(screen.getByText("Algo falló en esta pantalla"));
  assert.ok(screen.getByText("Menú"), "el resto de la app sigue en pantalla");
  assert.ok(screen.getByText("Reintentar"));
  assert.ok(screen.getByText(/objeto como texto/));
});
