import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

const rows = [{ id: "d618", title: "PDS isoBUNKER 618-SP", product: "Ficha 618 SP", status: "inventariado", extracted_text: "Temperatura de trabajo\n45 - 50 °C en manguera y pistola" }];
const fakeSupabase = { from: () => { const b = { select: () => b, not: () => b, range: async () => ({ data: rows, error: null }) }; return b; } };

test("Preguntale a tus productos muestra la línea de la ficha", async () => {
  const { ProductQuestion } = await loadJsxModule("src/ProductQuestion.jsx");
  render(React.createElement(ProductQuestion, { supabase: fakeSupabase }));
  fireEvent.change(screen.getByLabelText("Pregunta sobre un producto"), { target: { value: "¿con qué temperatura se trabaja el 618 SP?" } });
  fireEvent.click(screen.getByText("Preguntar"));
  assert.ok(await screen.findByText(/45 - 50 °C en manguera/));
  assert.ok(screen.getByText("sin validar"));
});
