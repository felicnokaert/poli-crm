import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { loadJsxModule } from "./helpers/load-jsx.mjs";

afterEach(cleanup);

const tables = {
  catalog_products: [
    { id: "p1", name: "Poliol isoBUNKER 618 SP", family: "Poliuretano", subfamily: "Rígido", status: "vigente" },
    { id: "p2", name: "Espuma PU-476 Ignífuga", family: "PENOSIL", subfamily: "Espumas", status: "vigente" },
    { id: "p3", name: "Almohada viscoelástica", family: "Almohadas", subfamily: "", status: "vigente" },
  ],
  product_document_links: [],
};
const fake = { from: (table) => { const b = { select: () => b, range: async () => ({ data: tables[table], error: null }), then: (r) => Promise.resolve({ data: tables[table], error: null }).then(r) }; return b; } };

test("Fichas por producto muestra cuántos tienen ficha y qué falta, sin contar las almohadas", async () => {
  const { ProductSheets } = await loadJsxModule("src/ProductSheets.jsx");
  render(React.createElement(ProductSheets, { supabase: fake, documents: [{ id: "d1", title: "PDS isoBUNKER 618-SP" }], isAdmin: true }));
  assert.ok(await screen.findByText("con ficha"));
  const counts = [...document.querySelectorAll(".import-counts strong")].map((el) => el.textContent);
  assert.deepEqual(counts, ["1", "1", "1"]);
  fireEvent.click(screen.getByText("PENOSIL"));
  assert.ok(screen.getByText("Espuma PU-476 Ignífuga"));
  assert.ok(screen.getByText("Subir ficha"));
});
