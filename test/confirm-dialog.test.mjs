import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

// Pantalla en blanco al tocar "Limpiar" o "Borrar usuario": confirm({ title, message }) rompía la app.
for (const [label, args] of [
  ["con un objeto", [{ title: "Borrar usuario", message: "¿Seguro?", confirmLabel: "Borrar" }]],
  ["con texto y opciones", ["¿Seguro?", { title: "Borrar usuario", confirmLabel: "Borrar" }]],
]) {
  test(`confirm ${label} muestra el diálogo y devuelve la respuesta`, async () => {
    const { ConfirmProvider, useConfirm } = await loadJsxModule("src/ConfirmDialog.jsx");
    let answer = null;
    function Probe() {
      const confirm = useConfirm();
      return React.createElement("button", { onClick: async () => { answer = await confirm(...args); } }, "Abrir");
    }
    render(React.createElement(ConfirmProvider, null, React.createElement(Probe)));
    fireEvent.click(screen.getByText("Abrir"));
    assert.ok(await screen.findByText("Borrar usuario"));
    assert.ok(screen.getByText("¿Seguro?"));
    fireEvent.click(screen.getByText("Borrar"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(answer, true);
  });
}
